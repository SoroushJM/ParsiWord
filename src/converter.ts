import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { wordMath } from './math';
import { mathLanguage, RichContentError } from './rich-content';
import { renderMermaid, type Diagram, type DiagramRenderer } from './diagrams';
import { Buffer } from 'buffer';
import type { FontBundle } from './fonts';
import { paragraphBaseDirection, wordDirectionSpans } from './word-direction';
import { delimiterFont, delimiterFontParts } from './delimiter-font';
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, HeadingLevel,
  LevelFormat, Packer, Paragraph, ShadingType, Table, TableCell, TableRow,
  TextRun, WidthType, ImageRun,
  type IParagraphOptions, type IRunOptions, type NumberingDefinition,
  type ParagraphChild,
} from 'docx';
import type { Root, RootContent, PhrasingContent, List, Table as MdTable } from 'mdast';

export type Direction = 'rtl' | 'auto' | 'ltr';
export type ExportSettings = {
  title: string;
  direction: Direction;
  fontSize: number;
  alignmentOnly: boolean;
  fontFamily: string;
};
export const defaultSettings: ExportSettings = {
  title: 'یادداشت من', direction: 'auto', fontSize: 12, alignmentOnly: false, fontFamily: 'Vazirmatn',
};
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

// Preserve logical Unicode text. Let OOXML and the reader perform visual ordering.
export function paragraphDirection(text: string, mode: Direction): 'rtl' | 'ltr' {
  if (mode !== 'auto') return mode;
  return paragraphBaseDirection(text);
}

type Leaf = { text: string; style: IRunOptions; href?: string; math?: ParagraphChild; code?: boolean; break?: boolean };
function leaves(nodes: readonly PhrasingContent[], style: IRunOptions = {}, href?: string): Leaf[] {
  return nodes.flatMap((n): Leaf[] => {
    switch (n.type) {
      case 'inlineMath': return [{ text: '\ufffc', style, href, math: wordMath(n.value) }];
      case 'text': return [{ text: n.value, style, href }];
      case 'strong': return leaves(n.children, { ...style, bold: true, boldComplexScript: true }, href);
      case 'emphasis': return leaves(n.children, { ...style, italics: true, italicsComplexScript: true }, href);
      case 'delete': return leaves(n.children, { ...style, strike: true }, href);
      case 'inlineCode': return [{ text: n.value, style: { ...style, font: 'Courier New', color: '145A53', shading: { fill: 'EDF5F3', type: ShadingType.CLEAR } }, code: true }];
      case 'link': return leaves(n.children, style, /^(https?:|mailto:)/i.test(n.url) ? n.url : undefined);
      case 'break': return [{ text: '\n', style, break: true }];
      case 'image': return [{ text: `[تصویر: ${n.alt || 'بدون عنوان'}]`, style }];
      case 'html': return [{ text: n.value, style }];
      case 'footnoteReference': return [{ text: `[${n.label || n.identifier}]`, style }];
      case 'linkReference': return leaves(n.children, style);
      case 'imageReference': return [{ text: `[تصویر: ${n.alt || n.identifier}]`, style }];
      default: return [];
    }
  });
}

export function createWord(markdown: string, settings: ExportSettings, fonts: FontBundle[] = [], diagrams: ReadonlyMap<string, Diagram> = new Map()): Document {
  const root = parser.parse(markdown) as Root;
  const numbering: NumberingDefinition[] = [];
  let listId = 0;
  let usesDelimiterFont = false;

  function fallbackPieces(pieces: Leaf[]): Leaf[] {
    return pieces.flatMap(piece => (piece.break || piece.math) ? [piece] : delimiterFontParts(piece.text).map(part => {
      if (!part.fallback) return { ...piece, text: part.text };
      usesDelimiterFont = true;
      return { ...piece, text: part.text, style: { ...piece.style, font: {
        ascii: delimiterFont.family, hAnsi: delimiterFont.family,
        eastAsia: delimiterFont.family, cs: delimiterFont.family,
      } } };
    }));
  }

  function para(nodes: readonly PhrasingContent[], extra: IParagraphOptions = {}) {
    const pieces = fallbackPieces(leaves(nodes));
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
          const run = piece.math || new TextRun({
            ...piece.style,
            ...(piece.break ? { break: 1 } : { text: piece.text.slice(start, end) }),
            rightToLeft: isRtl ? true : undefined,
            language: { value: isRtl ? 'fa-IR' : 'en-US', bidirectional: 'fa-IR' },
            ...(piece.href ? { color: '087F74', underline: {} } : {}),
          });
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
      spacing: { after: 160, line: 340 },
      ...extra,
    });
  }

  function list(node: List, depth = 0): (Paragraph | Table)[] {
    const reference = `list-${++listId}`;
    const flat = node.children.map(item => item.children.map(n => 'children' in n ? leaves(n.children as PhrasingContent[]).map(l => l.text).join('') : '').join('')).join(' ');
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
        if (child.type === 'list') return list(child, Math.min(depth + 1, 8));
        if (child.type === 'paragraph') {
          const task = item.checked == null ? [] : [{ type: 'text' as const, value: item.checked ? '☑ ' : '☐ ' }];
          const options: IParagraphOptions = first ? { numbering: { reference, level: depth } } : { indent: rtl ? { right: 440 * (depth + 1) } : { left: 440 * (depth + 1) } };
          first = false;
          return [para([...task, ...child.children], options)];
        }
        return block(child);
      });
    });
  }

  function table(node: MdTable) {
    const content = node.children.flatMap(r => r.children.flatMap(c => leaves(c.children).map(l => l.text))).join(' ');
    const rtl = !settings.alignmentOnly && paragraphDirection(content, settings.direction) === 'rtl';
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      visuallyRightToLeft: rtl,
      rows: node.children.map((row, rowIndex) => new TableRow({
        tableHeader: rowIndex === 0,
        children: row.children.map((cell, cellIndex) => new TableCell({
          shading: rowIndex === 0 ? { fill: 'E7F1EE' } : undefined,
          margins: { top: 100, bottom: 100, left: 120, right: 120 },
          children: [para(cell.children, {
            ...(node.align?.[cellIndex] ? { alignment: node.align[cellIndex] === 'center' ? AlignmentType.CENTER : node.align[cellIndex] === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT } : {}),
          })],
        })),
      })),
    });
  }

  function block(node: RootContent): (Paragraph | Table)[] {
    switch (node.type) {
      case 'paragraph': return [para(node.children)];
      case 'heading': return [para(node.children, { heading: HeadingLevel[`HEADING_${node.depth}`], keepNext: true, spacing: { before: 260, after: 160 } })];
      case 'list': return list(node);
      case 'table': return [table(node), new Paragraph({ text: '' })];
      case 'blockquote': return node.children.flatMap(child => child.type === 'paragraph'
        ? [para(child.children, { border: { right: { color: '219888', size: 18, style: BorderStyle.SINGLE, space: 12 } }, indent: { left: 200, right: 200 } })]
        : block(child));
      case 'math': return [new Paragraph({ children: [wordMath(node.value, true)], bidirectional: false, alignment: AlignmentType.CENTER, spacing: { before: 160, after: 160 } })];
      case 'code': {
        if (mathLanguage(node.lang)) return [new Paragraph({ children: [wordMath(node.value, true)], bidirectional: false, alignment: AlignmentType.CENTER })];
        if (node.lang?.toLowerCase() === 'mermaid') {
          const diagram = diagrams.get(node.value);
          if (!diagram) throw new RichContentError('نمودار هنوز برای خروجی آماده نشده است. دوباره امتحان کن.');
          const scale = Math.min(1, 620 / diagram.width, 760 / diagram.height);
          return [new Paragraph({ bidirectional: false, alignment: AlignmentType.CENTER, children: [new ImageRun({
            type: 'png', data: diagram.png, transformation: { width: Math.max(1, Math.round(diagram.width * scale)), height: Math.max(1, Math.round(diagram.height * scale)) },
            altText: { name: 'Mermaid', title: 'Mermaid diagram', description: node.value },
          })] })];
        }
        return node.value.split('\n').map(line => new Paragraph({
        bidirectional: false, alignment: AlignmentType.LEFT,
        shading: { fill: 'F1F4F5' }, spacing: { after: 0, line: 280 },
        children: fallbackPieces([{ text: line || ' ', style: { font: 'Courier New', size: 20 } }])
          .map(piece => new TextRun({ ...piece.style, text: piece.text })),
      }));
      }
      case 'thematicBreak': return [new Paragraph({ border: { bottom: { color: 'CEDBD7', size: 6, style: BorderStyle.SINGLE } } })];
      case 'html': return [para([{ type: 'text', value: node.value }])];
      case 'footnoteDefinition': return [para([{ type: 'text', value: `[${node.label || node.identifier}] ` }]), ...node.children.flatMap(block)];
      default: return [];
    }
  }

  const fontSize = Math.min(24, Math.max(9, settings.fontSize)) * 2;
  const family = settings.fontFamily || 'Arial';
  const selectedFont = fonts.find(f => f.family === family);
  const documentFont = { ascii: family, hAnsi: family, eastAsia: family, cs: selectedFont?.arabic === false ? 'Vazirmatn' : family };
  const headings = Array.from({ length: 6 }, (_, i) => ({
    id: `Heading${i + 1}`, name: `heading ${i + 1}`, basedOn: 'Normal', next: 'Normal',
    run: { font: documentFont, size: Math.max(fontSize, 44 - i * 4), sizeComplexScript: Math.max(fontSize, 44 - i * 4), bold: true, boldComplexScript: true, color: '183D36' },
  }));
  // Walk the content first: embed the fallback only when a run actually uses it.
  const children = root.children.flatMap(block);
  const embeddedFonts = fonts.map(font => ({ name: font.family, data: Buffer.from(font.regular), ...(font.bold ? { bold: Buffer.from(font.bold) } : {}) }));
  if (usesDelimiterFont) embeddedFonts.push({ name: delimiterFont.family, data: Buffer.from(delimiterFont.ttfBase64, 'base64') });
  return new Document({
    title: settings.title || 'یادداشت من', creator: 'ParsiWord',
    description: 'Markdown document exported locally with ParsiWord',
    styles: {
      default: { document: { run: { font: documentFont, size: fontSize, sizeComplexScript: fontSize, language: { value: 'fa-IR', bidirectional: 'fa-IR' } } } },
      paragraphStyles: headings,
    },
    numbering: { config: numbering },
    fonts: embeddedFonts,
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1100, bottom: 1100, left: 1000, right: 1000 } } }, children }],
  });
}

export async function exportWord(markdown: string, settings: ExportSettings, fonts: FontBundle[] = [], renderer: DiagramRenderer = renderMermaid): Promise<Uint8Array> {
  const diagrams = new Map<string, Diagram>();
  async function prepare(node: { type: string; lang?: string | null; value?: string; children?: readonly unknown[] }): Promise<void> {
    if (node.type === 'code' && node.lang?.toLowerCase() === 'mermaid' && node.value !== undefined && !diagrams.has(node.value)) {
      diagrams.set(node.value, await renderer(node.value));
    }
    if (node.children) for (const child of node.children) await prepare(child as Parameters<typeof prepare>[0]);
  }
  await prepare(parser.parse(markdown));
  return new Uint8Array(await Packer.toArrayBuffer(createWord(markdown, settings, fonts, diagrams)));
}

export function safeFilename(title: string): string {
  return (title.replace(/\.docx$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/^\.+|\.+$/g, '').trim().slice(0, 90) || 'document') + '.docx';
}
