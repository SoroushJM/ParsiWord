import { markdownContext, documentFontUsage, flowingText, type MarkdownContext } from './markdown';
import { bundledFont, codeRunFont, mathFont } from './font-assets';
import { wordMath } from './math';
import { mathLanguage, RichContentError } from './rich-content';
import { renderMermaid, type Diagram, type DiagramRenderer } from './diagrams';
import { renderTikz } from './tikz';
import { isTikzLanguage } from './tikz-language';
import { Buffer } from 'buffer';
import type { FontBundle } from './fonts';
import { wordDirectionSpans } from './word-direction';
import { paragraphDirection, type ExportSettings } from './document-model';
export { paragraphDirection, defaultSettings, type Direction, type ExportSettings } from './document-model';
import { delimiterFont, delimiterFontParts } from './delimiter-font';
import { highlightCode } from './code-highlight';
import { documentFontSize, documentHeadingSize, documentLayout } from './document-layout';
import { prepareExportImages, type ExportImage, type ExportImageReader, type ExportImageResolver } from './export-images';
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel,
  LevelFormat, Packer, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, WidthType, ImageRun, BuilderElement, TableLayoutType, LineRuleType,
  type IParagraphOptions, type IRunOptions, type NumberingDefinition,
  type ParagraphChild,
} from 'docx';
import type { RootContent, PhrasingContent, List, Table as MdTable } from 'mdast';

type Leaf = { text: string; style: IRunOptions; href?: string; math?: ParagraphChild; image?: { source: string; alt: string; title?: string | null }; code?: boolean; break?: boolean };
function leaves(nodes: readonly PhrasingContent[], style: IRunOptions = {}, href?: string, context?: MarkdownContext): Leaf[] {
  return nodes.flatMap((n): Leaf[] => {
    switch (n.type) {
      case 'inlineMath': return [{ text: '\ufffc', style, href, math: wordMath(n.value) }];
      case 'text': return [{ text: flowingText(n.value), style, href }];
      case 'strong': return leaves(n.children, { ...style, bold: true, boldComplexScript: true }, href, context);
      case 'emphasis': return leaves(n.children, { ...style, italics: true, italicsComplexScript: true }, href, context);
      case 'delete': return leaves(n.children, { ...style, strike: true }, href, context);
      case 'inlineCode': return [{ text: n.value, style: { ...style, font: codeRunFont, color: '145A53', shading: { fill: 'EDF5F3', type: ShadingType.CLEAR } }, code: true }];
      case 'link': return leaves(n.children, style, /^(https?:|mailto:)/i.test(n.url) ? n.url : undefined, context);
      case 'break': return [{ text: '\n', style, break: true }];
      case 'image': return [{ text: '\ufffc', style, href, image: { source: n.url, alt: n.alt || '', title: n.title } }];
      case 'html': return /^<br\s*\/?\s*>$/i.test(n.value)
        ? [{ text: '\n', style, href, break: true }]
        : [{ text: n.value, style }];
      case 'footnoteReference': return [{ text: `[${n.label || n.identifier}]`, style }];
      case 'linkReference': {
        const url = context?.definitions.get(n.identifier.toLowerCase())?.url;
        return leaves(n.children, style, url && /^(https?:|mailto:)/i.test(url) ? url : undefined, context);
      }
      case 'imageReference': {
        const definition = context?.definitions.get(n.identifier.toLowerCase());
        if (!definition) throw new RichContentError('IMAGE_NOT_READY');
        return [{ text: '\ufffc', style, href, image: { source: definition.url, alt: n.alt || '', title: definition.title } }];
      }
      default: return [];
    }
  });
}

export function createWord(markdown: string, settings: ExportSettings, fonts: FontBundle[] = [], diagrams: ReadonlyMap<string, Diagram> = new Map(), images: ReadonlyMap<string, ExportImage> = new Map()): Document {
  return createPreparedWord(markdownContext(markdown), settings, fonts, diagrams, images);
}
function createPreparedWord(context: MarkdownContext, settings: ExportSettings, fonts: FontBundle[], diagrams: ReadonlyMap<string, Diagram>, images: ReadonlyMap<string, ExportImage>): Document {
  const { root } = context;
  const numbering: NumberingDefinition[] = [];
  let listId = 0;
  let usesDelimiterFont = false;
  const pageWidth = documentLayout.width - documentLayout.margins.left - documentLayout.margins.right;
  const pageHeight = documentLayout.height - documentLayout.margins.top - documentLayout.margins.bottom;
  // Drawing dimensions use 96 dpi units; Word page and indentation data use twips.
  const imageHeight = (pageHeight - documentLayout.paragraph.after - documentLayout.paragraph.line) / 15;

  function imageRun(image: NonNullable<Leaf['image']>, availableWidth: number, availableHeight: number) {
    const prepared = images.get(image.source);
    if (!prepared || !prepared.png.byteLength || !Number.isFinite(prepared.width) || !Number.isFinite(prepared.height) || prepared.width <= 0 || prepared.height <= 0) {
      throw new RichContentError('IMAGE_NOT_READY');
    }
    if (availableWidth <= 0 || availableHeight <= 0) throw new RichContentError('IMAGE_EXPORT_TOO_LARGE');
    const scale = Math.min(1, availableWidth / 15 / prepared.width, availableHeight / prepared.height);
    return new ImageRun({
      type: 'png', data: prepared.png,
      transformation: { width: prepared.width * scale, height: prepared.height * scale },
      altText: { name: image.alt || 'Image', title: image.title || image.alt || 'Image', description: image.alt },
    });
  }

  function fallbackPieces(pieces: Leaf[]): Leaf[] {
    return pieces.flatMap(piece => (piece.break || piece.math || piece.image) ? [piece] : delimiterFontParts(piece.text).map(part => {
      if (!part.fallback) return { ...piece, text: part.text };
      usesDelimiterFont = true;
      return { ...piece, text: part.text, style: { ...piece.style, font: {
        ascii: delimiterFont.family, hAnsi: delimiterFont.family,
        eastAsia: delimiterFont.family, cs: delimiterFont.family,
      } } };
    }));
  }

  function para(nodes: readonly PhrasingContent[], extra: IParagraphOptions = {}, availableWidth = pageWidth, availableHeight = imageHeight) {
    const pieces = fallbackPieces(leaves(nodes, {}, undefined, context));
    const text = pieces.map(p => p.text).join('');
    const dir = paragraphDirection(text, settings.direction);
    const rtl = dir === 'rtl';
    let codeOffset = 0;
    const codeRanges = pieces.flatMap(piece => {
      const start = codeOffset;
      codeOffset += piece.text.length;
      return piece.code ? [{ start, end: codeOffset }] : [];
    });
    // Determine phrase context before intersecting bold/italic/link boundaries.
    // Word renders logical text; resolved visual levels are never serialized.
    const spans = settings.alignmentOnly
      ? [{ start: 0, end: text.length, direction: 'ltr' as const, needsBoundaryMarks: false }]
      : wordDirectionSpans(text, dir, codeRanges);
    const children: ParagraphChild[] = [];
    let activeLink: string | undefined, linkRuns: ParagraphChild[] = [];
    function appendRun(run: ParagraphChild, href?: string) {
      if (!href) {
        activeLink = undefined;
        children.push(run);
      } else if (href === activeLink) linkRuns.push(run);
      else {
        activeLink = href;
        linkRuns = [run];
        children.push(new ExternalHyperlink({ link: href, children: linkRuns }));
      }
    }
    let pieceIndex = 0, pieceStart = 0;
    for (const span of spans) {
      if ('startRtlEmbedding' in span && span.startRtlEmbedding) appendRun(new TextRun('\u202b'), pieces[pieceIndex]?.href);
      if (span.needsBoundaryMarks) appendRun(new TextRun('\u200e'), pieces[pieceIndex]?.href);
      let endLink: string | undefined;
      while (pieceIndex < pieces.length && pieceStart < span.end) {
        const piece = pieces[pieceIndex];
        const pieceEnd = pieceStart + piece.text.length;
        const start = Math.max(span.start, pieceStart) - pieceStart;
        const end = Math.min(span.end, pieceEnd) - pieceStart;
        if (end > start) {
          const isRtl = !settings.alignmentOnly && span.direction === 'rtl';
          const run = piece.math || (piece.image ? imageRun(piece.image, availableWidth, availableHeight) : new TextRun({
            ...piece.style,
            ...(piece.break ? { break: 1 } : { text: piece.text.slice(start, end) }),
            rightToLeft: isRtl ? true : undefined,
            language: { value: isRtl ? 'fa-IR' : 'en-US', bidirectional: 'fa-IR' },
            ...(piece.href ? { color: '087F74', underline: {} } : {}),
          }));
          appendRun(run, piece.href);
          endLink = piece.href;
        }
        if (pieceEnd > span.end) break;
        pieceStart = pieceEnd;
        pieceIndex++;
      }
      if (span.needsBoundaryMarks) appendRun(new TextRun('\u200e'), endLink);
      if ('endRtlEmbedding' in span && span.endRtlEmbedding) appendRun(new TextRun('\u202c'), endLink);
    }
    return new Paragraph({
      children,
      bidirectional: settings.alignmentOnly ? false : rtl,
      alignment: rtl || settings.alignmentOnly ? AlignmentType.RIGHT : AlignmentType.LEFT,
      spacing: { ...documentLayout.paragraph },
      ...extra,
      // Images set their own line height. Keep the usual text minimum without
      // multiplying a page-sized drawing by the normal prose line multiple.
      ...(pieces.some(piece => piece.image) ? { spacing: { ...documentLayout.paragraph, ...extra.spacing, lineRule: LineRuleType.AT_LEAST } } : {}),
    });
  }

  function list(node: List, depth = 0, availableWidth = pageWidth): (Paragraph | Table)[] {
    const reference = `list-${++listId}`;
    const flat = node.children.map(item => item.children.map(n => 'children' in n ? leaves(n.children as PhrasingContent[], {}, undefined, context).map(l => l.text).join('') : '').join('')).join(' ');
    const rtl = !settings.alignmentOnly && paragraphDirection(flat, settings.direction) === 'rtl';
    numbering.push({ reference, levels: Array.from({ length: 9 }, (_, level) => ({
      level,
      format: node.ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
      text: node.ordered ? `%${level + 1}.` : '•',
      start: node.ordered ? (node.start ?? 1) : 1,
      alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
      style: { paragraph: { indent: rtl ? { right: 440 * (level + 1), hanging: 220 } : { left: 440 * (level + 1), hanging: 220 } } },
    })) });
    return node.children.flatMap(item => {
      let first = true;
      return item.children.flatMap((child): (Paragraph | Table)[] => {
        if (child.type === 'list') return list(child, Math.min(depth + 1, 8), availableWidth);
        if (child.type === 'paragraph') {
          const task = item.checked == null ? [] : [{ type: 'text' as const, value: item.checked ? '☑ ' : '☐ ' }];
          const options: IParagraphOptions = first ? { numbering: { reference, level: depth } } : { indent: rtl ? { right: 440 * (depth + 1) } : { left: 440 * (depth + 1) } };
          first = false;
          return [para([...task, ...child.children], options, availableWidth - 440 * (depth + 1))];
        }
        return block(child, availableWidth - 440 * (depth + 1));
      });
    });
  }

  function table(node: MdTable, availableWidth: number) {
    const content = node.children.flatMap(r => r.children.flatMap(c => leaves(c.children, {}, undefined, context).map(l => l.text))).join(' ');
    const rtl = !settings.alignmentOnly && paragraphDirection(content, settings.direction) === 'rtl';
    const columns = node.children.reduce((maximum, row) => Math.max(maximum, row.children.length), 1);
    const columnWidths = Array.from({ length: columns }, (_, index) => Math.floor(availableWidth * (index + 1) / columns) - Math.floor(availableWidth * index / columns));
    const hasImages = node.children.some(row => row.children.some(cell => leaves(cell.children, {}, undefined, context).some(leaf => leaf.image)));
    const horizontalMargin = hasImages ? Math.min(120, Math.max(0, Math.floor((Math.floor(availableWidth / columns) - 15) / 2))) : 120;
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      ...(hasImages ? { width: { size: availableWidth, type: WidthType.DXA }, columnWidths, layout: TableLayoutType.FIXED } : {}),
      visuallyRightToLeft: rtl,
      rows: node.children.map((row, rowIndex) => new TableRow({
        tableHeader: rowIndex === 0,
        children: row.children.map((cell, cellIndex) => new TableCell({
          ...(hasImages ? { width: { size: columnWidths[cellIndex], type: WidthType.DXA } } : {}),
          shading: rowIndex === 0 ? { fill: 'E7F1EE' } : undefined,
          margins: { top: 100, bottom: 100, left: horizontalMargin, right: horizontalMargin },
          children: [para(cell.children, {
            ...(node.align?.[cellIndex] ? { alignment: node.align[cellIndex] === 'center' ? AlignmentType.CENTER : node.align[cellIndex] === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT } : {}),
          }, columnWidths[cellIndex] - horizontalMargin * 2, (pageHeight / 2 - 200 - documentLayout.paragraph.after - documentLayout.paragraph.line) / 15)],
        })),
      })),
    });
  }

  function block(node: RootContent, availableWidth = pageWidth): (Paragraph | Table)[] {
    switch (node.type) {
      case 'paragraph': return [para(node.children, {}, availableWidth)];
      case 'heading': return [para(node.children, { heading: HeadingLevel[`HEADING_${node.depth}`], keepNext: true, spacing: { before: 260, after: 160 } }, availableWidth, imageHeight - 260 / 15)];
      case 'list': return list(node, 0, availableWidth);
      case 'table': return [table(node, availableWidth), new Paragraph({ text: '' })];
      case 'blockquote': return node.children.flatMap(child => child.type === 'paragraph'
        ? [para(child.children, { border: { right: { color: '219888', size: 18, style: BorderStyle.SINGLE, space: 12 } }, indent: { left: 200, right: 200 } }, availableWidth - 400)]
        : block(child, availableWidth - 400));
      case 'math': return [new Paragraph({ children: [wordMath(node.value, true)], bidirectional: false, alignment: AlignmentType.CENTER, spacing: { before: 160, after: 160 } })];
      case 'code': {
        if (mathLanguage(node.lang)) return [new Paragraph({ children: [wordMath(node.value, true)], bidirectional: false, alignment: AlignmentType.CENTER })];
        if (node.lang?.toLowerCase() === 'mermaid' || isTikzLanguage(node.lang)) {
          const tikz = isTikzLanguage(node.lang), name = tikz ? 'TikZ' : 'Mermaid';
          const diagram = diagrams.get(tikz ? `tikz\0${node.value}` : node.value);
          if (!diagram || !diagram.png.byteLength || !Number.isFinite(diagram.width) || !Number.isFinite(diagram.height) || diagram.width <= 0 || diagram.height <= 0 || availableWidth <= 0) throw new RichContentError('DIAGRAM_NOT_READY');
          const scale = Math.min(1, 620 / diagram.width, 760 / diagram.height, availableWidth / 15 / diagram.width, imageHeight / diagram.height);
          return [new Paragraph({ bidirectional: false, alignment: AlignmentType.CENTER,
            spacing: { ...documentLayout.paragraph, lineRule: LineRuleType.AT_LEAST }, children: [new ImageRun({
            type: 'png', data: diagram.png, transformation: { width: diagram.width * scale, height: diagram.height * scale },
            altText: { name, title: `${name} diagram`, description: node.value },
          })] })];
        }
        const code = highlightCode(node.value, node.lang);
        const header = new Paragraph({
          bidirectional: false, alignment: AlignmentType.LEFT, keepNext: true,
          shading: { fill: 'E7EDEB' }, spacing: { before: 160, after: 0 },
          children: [new TextRun({ text: code.label, font: codeRunFont, size: 16, color: '57606A', bold: true })],
        });
        return [header, ...code.lines.map(line => new Paragraph({
          bidirectional: false, alignment: AlignmentType.LEFT,
          shading: { fill: 'F1F4F5' }, spacing: { after: 0, line: 280 },
          children: fallbackPieces(line.length ? line.map(token => ({ text: token.text, style: {
            font: codeRunFont, size: 20, color: token.color, bold: token.bold,
            boldComplexScript: token.bold, italics: token.italic, italicsComplexScript: token.italic,
          } })) : [{ text: '', style: { font: codeRunFont, size: 20 } }])
            .map(piece => new TextRun({ ...piece.style, text: piece.text })),
        }))];
      }
      case 'thematicBreak': return [new Paragraph({ border: { bottom: { color: 'CEDBD7', size: 6, style: BorderStyle.SINGLE } } })];
      case 'html': return [para([{ type: 'text', value: node.value }])];
      case 'footnoteDefinition': return [para([{ type: 'text', value: `[${node.label || node.identifier}] ` }]), ...node.children.flatMap(child => block(child, availableWidth))];
      default: return [];
    }
  }

  const fontSize = documentFontSize(settings.fontSize) * 2;
  const family = settings.fontFamily || bundledFont;
  const selectedFont = fonts.find(f => f.family === family);
  const documentFont = { ascii: family, hAnsi: family, eastAsia: family, cs: selectedFont?.arabic === false ? 'Vazirmatn' : family };
  const headings = Array.from({ length: 6 }, (_, i) => ({
    id: `Heading${i + 1}`, name: `heading ${i + 1}`, basedOn: 'Normal', next: 'Normal',
    run: { font: documentFont, size: documentHeadingSize(settings.fontSize, i + 1) * 2, sizeComplexScript: documentHeadingSize(settings.fontSize, i + 1) * 2, bold: true, boldComplexScript: true, color: '183D36' },
  }));
  // Walk the content first: embed the fallback only when a run actually uses it.
  const children = root.children.flatMap(node => block(node));
  const embeddedFonts = fonts.map(font => ({ name: font.family, data: Buffer.from(font.regular), ...(font.bold ? { bold: Buffer.from(font.bold) } : {}) }));
  if (usesDelimiterFont) embeddedFonts.push({ name: delimiterFont.family, data: Buffer.from(delimiterFont.ttfBase64, 'base64') });
  const document = new Document({
    title: settings.title || 'یادداشت من', creator: 'ParsiWord',
    description: 'Markdown document exported locally with ParsiWord',
    styles: {
      default: { document: { run: { font: documentFont, size: fontSize, sizeComplexScript: fontSize, language: { value: 'fa-IR', bidirectional: 'fa-IR' } } } },
      paragraphStyles: headings,
    },
    numbering: { config: numbering },
    fonts: embeddedFonts,
    sections: [{ properties: { page: { size: { width: documentLayout.width, height: documentLayout.height }, margin: { ...documentLayout.margins } } }, children }],
  });
  if (documentFontUsage(root).math) document.Settings.addChildElement(new BuilderElement({
    name: 'm:mathPr', attributes: { xmlns: { key: 'xmlns:m', value: 'http://schemas.openxmlformats.org/officeDocument/2006/math' } },
    children: [new BuilderElement({ name: 'm:mathFont', attributes: { val: { key: 'm:val', value: mathFont } } })],
  }));
  return document;
}

export async function exportWord(markdown: string, settings: ExportSettings, fonts: FontBundle[] = [], renderer: DiagramRenderer = renderMermaid, resolveImage?: ExportImageResolver, readImage?: ExportImageReader, tikzRenderer: DiagramRenderer = renderTikz): Promise<Uint8Array> {
  return exportPreparedWord(markdownContext(markdown), settings, fonts, renderer, resolveImage, readImage, tikzRenderer);
}

/** One operation owns its source, parsed tree and font/image/diagram inputs. */
export async function exportPreparedWord(context: MarkdownContext, settings: ExportSettings, fonts: FontBundle[] = [], renderer: DiagramRenderer = renderMermaid, resolveImage?: ExportImageResolver, readImage?: ExportImageReader, tikzRenderer: DiagramRenderer = renderTikz): Promise<Uint8Array> {
  settings = { ...settings };
  const diagrams = new Map<string, Diagram>();
  let decodedPixels = 0, imageBytes = 0;
  const accountPicture = (picture: { png: Uint8Array }, code: 'TIKZ_TOO_LARGE' | 'DIAGRAM_TOO_LARGE' | 'IMAGE_EXPORT_TOO_LARGE') => {
    imageBytes += picture.png.byteLength;
    if (picture.png.byteLength >= 24) {
      const view = new DataView(picture.png.buffer, picture.png.byteOffset, picture.png.byteLength);
      decodedPixels += view.getUint32(16) * view.getUint32(20);
    }
    if (decodedPixels > 24_000_000 || imageBytes > 32 * 1024 * 1024) throw new RichContentError(code);
  };
  async function prepare(node: { type: string; lang?: string | null; value?: string; children?: readonly unknown[] }): Promise<void> {
    if (node.type === 'code' && node.value !== undefined && (node.lang?.toLowerCase() === 'mermaid' || isTikzLanguage(node.lang))) {
      const tikz = isTikzLanguage(node.lang), key = tikz ? `tikz\0${node.value}` : node.value;
      if (!diagrams.has(key)) {
        const diagram = await (tikz ? tikzRenderer : renderer)(node.value);
        accountPicture(diagram, tikz ? 'TIKZ_TOO_LARGE' : 'DIAGRAM_TOO_LARGE');
        diagrams.set(key, diagram);
      }
    }
    if (node.children) for (const child of node.children) await prepare(child as Parameters<typeof prepare>[0]);
  }
  const images = await prepareExportImages(context, resolveImage, readImage);
  for (const image of images.values()) accountPicture(image, 'IMAGE_EXPORT_TOO_LARGE');
  await prepare(context.root);
  return new Uint8Array(await Packer.toArrayBuffer(createPreparedWord(context, settings, fonts, diagrams, images)));
}

export function safeFilename(title: string): string {
  return (title.replace(/\.docx$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/^\.+|\.+$/g, '').trim().slice(0, 90) || 'document') + '.docx';
}
