import { Buffer } from 'buffer';
import bidiFactory from 'bidi-js';
import type { PhrasingContent, RootContent, Table as MarkdownTable } from 'mdast';
import type { ExportSettings } from './document-model';
import { documentLayout, documentFontSize, documentHeadingSize, twipsToPoints } from './document-layout';
import { paragraphBaseDirection } from './word-direction';
import { markdownContext, flowingText, type MarkdownContext } from './markdown';
import { MAX_MARKDOWN_LENGTH } from './document-limits';
import { documentFonts, type FontBundle } from './fonts';
import { bundledFont, codeFont } from './font-assets';
import { delimiterFont, delimiterFontParts } from './delimiter-font';
import { highlightCode } from './code-highlight';
import { renderMath } from './math';
import { mathLanguage, RichContentError } from './rich-content';
import { renderMermaid, type DiagramRenderer } from './diagrams';
import { prepareExportImages, type ExportImageResolver, type ExportImageReader } from './export-images';
import 'katex/dist/katex.min.css';

/** Same physical A4 page and margins as the Word export (20 twips = 1pt). */
export const pdfPage = { width: twipsToPoints(documentLayout.width), height: twipsToPoints(documentLayout.height), top: twipsToPoints(documentLayout.margins.top), bottom: twipsToPoints(documentLayout.margins.bottom), left: twipsToPoints(documentLayout.margins.left), right: twipsToPoints(documentLayout.margins.right) } as const;
export type PdfPicture = { png: Uint8Array; width: number; height: number };
export type PdfAssets = { formula?: (source: string, display: boolean, fontSize: number) => Promise<PdfPicture>; diagram?: DiagramRenderer; resolveImage?: ExportImageResolver; readImage?: ExportImageReader };
type Inline = { text: string; bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean; href?: string; color?: string; picture?: PdfPicture; font?: string };
type Part = Inline & { width: number; size: number; font: string };
type Line = { parts: Part[]; width: number; height: number; text: string };
type VisualRun<T> = { value: T; text: string; level: number };
const bidi = bidiFactory() as ReturnType<typeof bidiFactory> & { getMirroredCharacter(character: string): string | null };
const shapingFeatures: ('kern' | 'liga')[] = ['kern', 'liga'];

/** Order complete logical runs, never reverse Arabic before fontkit shapes it. */
export function pdfVisualRuns<T extends { text: string }>(pieces: readonly T[], direction: 'ltr' | 'rtl'): VisualRun<T>[] {
  const text = pieces.map(piece => piece.text).join('');
  const { levels } = bidi.getEmbeddingLevels(text, direction);
  const runs: VisualRun<T>[] = [];
  let offset = 0;
  for (const value of pieces) {
    let chunk = '', level = levels[offset] ?? (direction === 'rtl' ? 1 : 0);
    for (const character of value.text) {
      const next = levels[offset] ?? level;
      if (next !== level && chunk) { runs.push({ value, text: chunk, level }); chunk = ''; }
      level = next;
      chunk += next % 2 ? bidi.getMirroredCharacter(character) || character : character;
      offset += character.length;
    }
    if (chunk) runs.push({ value, text: chunk, level });
  }
  let maximum = 0, minimumOdd = Infinity;
  for (const run of runs) { maximum = Math.max(maximum, run.level); if (run.level % 2) minimumOdd = Math.min(minimumOdd, run.level); }
  for (let level = maximum; level >= minimumOdd; level--) {
    for (let start = 0; start < runs.length;) {
      if (runs[start].level < level) { start++; continue; }
      let end = start + 1;
      while (end < runs.length && runs[end].level >= level) end++;
      for (let left = start, right = end - 1; left < right; left++, right--) [runs[left], runs[right]] = [runs[right], runs[left]];
      start = end;
    }
  }
  return runs;
}

async function formulaPicture(source: string, display: boolean, fontSize: number): Promise<PdfPicture> {
  if (typeof document === 'undefined') throw new RichContentError('MATH_PDF_UNAVAILABLE');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-1250rem;top:0;width:max-content;pointer-events:none';
  const element = document.createElement('span');
  // Keep the captured element in its own local coordinate system. Copying an
  // offscreen element's computed logical insets into foreignObject would move
  // the formula outside the bitmap even after overriding its physical left.
  const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  element.style.cssText = `display:inline-block;width:max-content;max-width:none;background:white;color:#172d24;font-size:${fontSize * 96 / 72 / rootSize}rem;padding:0.25rem;direction:ltr;line-height:normal`;
  // This is KaTeX's validated, trust:false output, never raw source HTML.
  element.innerHTML = renderMath(source, display);
  host.append(element); document.body.append(host);
  try {
    await document.fonts.ready;
    const { toBlob } = await import('html-to-image');
    const width = Math.max(1, element.scrollWidth), height = Math.max(1, element.scrollHeight);
    const blob = await toBlob(element, { pixelRatio: Math.min(2, 4096 / width, 4096 / height), backgroundColor: '#ffffff', style: { position: 'relative', left: '0', top: '0' }, preferredFontFormat: 'woff2' });
    if (!blob) throw new RichContentError('PDF_FORMULA_IMAGE_FAILED');
    return { png: new Uint8Array(await blob.arrayBuffer()), width: width * 72 / 96, height: height * 72 / 96 };
  } finally { host.remove(); }
}

/** Local downloadable PDF. Text remains vector/searchable; only formulas and
 * diagrams and Markdown pictures use bounded embedded images. */
export async function exportPdf(markdown: string, settings: ExportSettings, suppliedFonts?: FontBundle[], assets: PdfAssets = {}): Promise<Uint8Array> {
  return exportPreparedPdf(markdownContext(markdown), settings, suppliedFonts, assets);
}

export async function exportPreparedPdf(context: MarkdownContext, settings: ExportSettings, suppliedFonts?: FontBundle[], assets: PdfAssets = {}): Promise<Uint8Array> {
  settings = { ...settings };
  const markdown = context.source;
  if (markdown.length > MAX_MARKDOWN_LENGTH) throw new RichContentError('DOCUMENT_TOO_LARGE');
  const fonts = suppliedFonts?.length ? suppliedFonts : await documentFonts(settings.fontFamily, context.root);
  const primary = fonts.find(font => font.family === settings.fontFamily) || fonts.find(font => font.family === bundledFont) || fonts[0];
  if (!primary) throw new RichContentError('PDF_FONT_NOT_READY');
  const images = await prepareExportImages(context, assets.resolveImage, assets.readImage);
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({ autoFirstPage: false, font: null as never, compress: true, info: { Title: settings.title || 'یادداشت من', Author: 'ParsiWord', Creator: 'ParsiWord', Producer: 'ParsiWord / PDFKit' } });
  const chunks: Uint8Array[] = [];
  const finished = new Promise<Uint8Array>((resolve, reject) => {
    doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => { const output = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0)); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; } resolve(output); });
  });
  const names = new Map<string, { regular: string; bold: string; arabic: boolean }>();
  fonts.forEach((font, index) => {
    const regular = `Font${index}`, bold = font.bold ? `${regular}Bold` : regular;
    doc.registerFont(regular, Buffer.from(font.regular));
    if (font.bold) doc.registerFont(bold, Buffer.from(font.bold));
    names.set(font.family, { regular, bold, arabic: font.arabic });
  });
  doc.registerFont('Symbols', Buffer.from(delimiterFont.ttfBase64, 'base64'));
  const fallback = names.get(bundledFont) || names.get(primary.family)!;
  const { root, definitions } = context;
  const fontSize = documentFontSize(settings.fontSize);
  const pictures = new Map<string, Promise<PdfPicture>>();
  let formulaQueue: Promise<void> = Promise.resolve(), decodedPixels = 0, imageBytes = 0;
  const accountPicture = (image: PdfPicture) => {
    if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0) throw new RichContentError('PDF_IMAGE_INVALID');
    if (image.png.length >= 24) {
      const view = new DataView(image.png.buffer, image.png.byteOffset, image.png.byteLength);
      const width = view.getUint32(16), height = view.getUint32(20);
      decodedPixels += width * height;
    }
    imageBytes += image.png.byteLength;
    if (decodedPixels > 24_000_000 || imageBytes > 32 * 1024 * 1024) throw new RichContentError('PDF_IMAGE_BUDGET');
    return image;
  };
  const picture = (source: string, display: boolean) => {
    const key = `${display}:${source}`;
    if (!pictures.has(key)) {
      // A table may contain hundreds of unique formulas. Keep only one DOM /
      // canvas capture alive at a time, and don't retain every PNG in a cache.
      const pending = formulaQueue.then(() => (assets.formula || formulaPicture)(source, display, fontSize)).then(accountPicture);
      formulaQueue = pending.then(() => undefined, () => undefined);
      pictures.set(key, pending);
      if (pictures.size > 32) pictures.delete(pictures.keys().next().value!);
    }
    return pictures.get(key)!;
  };
  // Account each resource once, including repeated reference images. Markdown
  // intrinsic raster dimensions use 96dpi; PDF layout uses physical points.
  const markdownImages = new Map([...images].map(([source, image]) => [source, accountPicture({ ...image, width: image.width * 72 / 96, height: image.height * 72 / 96 })]));
  let y = pdfPage.top;
  const bottom = pdfPage.height - pdfPage.bottom, contentWidth = pdfPage.width - pdfPage.left - pdfPage.right;
  const page = () => { doc.addPage({ size: [pdfPage.width, pdfPage.height], margins: { top: pdfPage.top, bottom: pdfPage.bottom, left: pdfPage.left, right: pdfPage.right } }); y = pdfPage.top; };
  const ensure = (height: number) => { if (y + height > bottom && y > pdfPage.top) page(); };
  page();

  function typed(pieces: readonly Inline[], size: number): Part[] {
    return pieces.flatMap(piece => {
      if (piece.picture) return [{ ...piece, font: fallback.regular, size, width: piece.picture.width }];
      const selected = names.get(piece.code ? codeFont : primary.family) || names.get(primary.family)!;
      // The selected font applies to all supported prose; Latin-only faces use
      // the exact same Vazirmatn Arabic fallback as the Word document.
      const fragments = piece.text.split(/([\u0600-\u08ff\ufb50-\ufdff\ufe70-\ufeff]+)/u);
      return fragments.flatMap(fragment => delimiterFontParts(fragment).map(part => {
        const family = !selected.arabic && /[\u0600-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u.test(part.text) ? fallback : selected;
        const font = part.fallback ? 'Symbols' : piece.bold ? family.bold : family.regular;
        return { ...piece, text: part.text, font, size, width: 0 };
      }));
    });
  }
  const measure = (part: Part, value = part.text) => part.picture ? part.picture.width : doc.font(part.font).fontSize(part.size).widthOfString(value, { features: shapingFeatures });

  function wrap(pieces: readonly Inline[], width: number, size: number, imageHeight = bottom - pdfPage.top - 6): Line[] {
    const output: Line[] = [];
    const code = pieces.length > 0 && pieces.every(piece => piece.code);
    const lineHeight = size * (code ? documentLayout.code.line : documentLayout.paragraph.line) / 240;
    let line: Line = { parts: [], width: 0, height: lineHeight, text: '' };
    const flush = () => { output.push(line); line = { parts: [], width: 0, height: lineHeight, text: '' }; };
    const append = (part: Part) => {
      const previous = line.parts[line.parts.length - 1];
      if (previous && !previous.picture && !part.picture && previous.font === part.font && previous.size === part.size && previous.bold === part.bold && previous.italic === part.italic && previous.strike === part.strike && previous.href === part.href && previous.color === part.color) {
        previous.text += part.text; previous.width += part.width;
      } else line.parts.push({ ...part });
      line.width += part.width; line.text += part.text; line.height = Math.max(line.height, part.picture ? part.picture.height + 3 : lineHeight);
    };
    for (const part of typed(pieces, size)) {
      if (part.picture) {
        const scale = Math.min(1, width / part.picture.width, imageHeight / part.picture.height);
        const scaled = { ...part, width: part.picture.width * scale, picture: { ...part.picture, width: part.picture.width * scale, height: part.picture.height * scale } };
        if (line.width && line.width + scaled.width > width) flush();
        append(scaled); continue;
      }
      for (const word of part.text.replace(/\r\n?/g, '\n').split(/(\n|[^\S\n]+|[^\s]+)/u)) {
        if (!word) continue;
        if (word === '\n') { flush(); continue; }
        const advance = measure(part, word);
        if (line.width && line.width + advance > width) flush();
        if (advance <= width) { append({ ...part, text: word, width: advance }); continue; }
        // Long code/URLs are split on Unicode code points, never clipped or
        // raster-sliced across page edges. Chunk measurements stay bounded.
        let value = '';
        for (const character of word) {
          if (measure(part, character) > width) throw new RichContentError('PDF_COLUMN_TOO_NARROW');
          const candidate = value + character;
          if (value && measure(part, candidate) > width - line.width) { append({ ...part, text: value, width: measure(part, value) }); flush(); value = character; }
          else value = candidate;
        }
        if (value) append({ ...part, text: value, width: measure(part, value) });
      }
    }
    if (line.parts.length || !output.length) flush();
    return output;
  }

  function drawLine(line: Line, x: number, top: number, width: number, direction: 'ltr' | 'rtl', align?: 'left' | 'right' | 'center') {
    const actualAlign = align || (direction === 'rtl' ? 'right' : 'left');
    let left = x + (actualAlign === 'right' ? width - line.width : actualAlign === 'center' ? (width - line.width) / 2 : 0);
    doc.markContent('Span', { actual: line.text });
    for (const run of pdfVisualRuns(line.parts, direction)) {
      const part = run.value;
      if (part.picture) {
        doc.image(Buffer.from(part.picture.png), left, top, { width: part.picture.width, height: part.picture.height });
        if (part.href) doc.link(left, top, part.picture.width, part.picture.height, part.href);
        left += part.picture.width; continue;
      }
      doc.font(part.font).fontSize(part.size).fillColor(part.color || (part.href ? '#087f74' : '#213b30'));
      // Explicit features make PDFKit shape the complete run; its word cache
      // otherwise emits multiple Arabic words in their logical left-to-right order.
      doc.text(run.text, left, top, { lineBreak: false, baseline: 'top', features: shapingFeatures, oblique: part.italic, strike: part.strike, underline: !!part.href, ...(part.href ? { link: part.href } : {}) });
      left += measure(part, run.text);
    }
    doc.endMarkedContent();
  }

  async function inlines(nodes: readonly PhrasingContent[], style: Omit<Inline, 'text'> = {}): Promise<Inline[]> {
    const output: Inline[] = [];
    for (const node of nodes) {
      switch (node.type) {
        case 'text': output.push({ ...style, text: flowingText(node.value) }); break;
        case 'strong': output.push(...await inlines(node.children, { ...style, bold: true })); break;
        case 'emphasis': output.push(...await inlines(node.children, { ...style, italic: true })); break;
        case 'delete': output.push(...await inlines(node.children, { ...style, strike: true })); break;
        case 'inlineCode': output.push({ ...style, text: node.value, code: true, color: '#145a53' }); break;
        case 'inlineMath': output.push({ ...style, text: '\ufffc', picture: await picture(node.value, false) }); break;
        case 'link': output.push(...await inlines(node.children, { ...style, ...(/^(https?:|mailto:)/i.test(node.url) ? { href: node.url } : {}) })); break;
        case 'linkReference': {
          const url = definitions.get(node.identifier.toLowerCase())?.url;
          output.push(...await inlines(node.children, { ...style, ...(url && /^(https?:|mailto:)/i.test(url) ? { href: url } : {}) })); break;
        }
        case 'break': output.push({ ...style, text: '\n' }); break;
        case 'html': output.push({ ...style, text: /^<br\s*\/?\s*>$/i.test(node.value) ? '\n' : node.value }); break;
        case 'image': case 'imageReference': {
          const source = node.type === 'image' ? node.url : definitions.get(node.identifier.toLowerCase())?.url;
          const image = source ? markdownImages.get(source) : undefined;
          if (!image) throw new RichContentError('IMAGE_NOT_READY');
          output.push({ ...style, text: '\ufffc', picture: image }); break;
        }
        case 'footnoteReference': output.push({ ...style, text: `[${node.label || node.identifier}]` }); break;
      }
    }
    return output;
  }
  const directionFor = (text: string, force?: 'ltr' | 'rtl') => force || (settings.alignmentOnly ? 'ltr' : settings.direction === 'auto' ? paragraphBaseDirection(text) : settings.direction);
  async function paragraph(pieces: Inline[], options: { size?: number; indent?: number; force?: 'ltr' | 'rtl'; align?: 'left' | 'right' | 'center'; before?: number; after?: number; fill?: string; quote?: boolean; marker?: string; keepNext?: boolean } = {}) {
    const size = options.size || fontSize, indent = Math.min(options.indent || 0, contentWidth / 2), width = contentWidth - indent;
    const lines = wrap(pieces, width, size), direction = directionFor(pieces.map(piece => piece.text).join(''), options.force);
    const x = pdfPage.left + (direction === 'ltr' ? indent : 0);
    y += options.before || 0;
    ensure(lines[0].height + (options.keepNext ? Math.max(17, fontSize * 1.45) : 0));
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]; ensure(line.height);
      if (options.fill) doc.save().fillColor(options.fill).rect(x - 4, y - 1, width + 8, line.height + 2).fill().restore();
      if (options.quote) doc.save().lineWidth(2).strokeColor('#219888').moveTo(direction === 'rtl' ? x + width + 5 : x - 5, y).lineTo(direction === 'rtl' ? x + width + 5 : x - 5, y + line.height).stroke().restore();
      if (!index && options.marker) {
        const marker = wrap([{ text: options.marker }], 35, size)[0];
        drawLine(marker, direction === 'rtl' ? x + width + 3 : x - 25, y, 22, direction, direction === 'rtl' ? 'left' : 'right');
      }
      drawLine(line, x, y, width, direction, options.align || (settings.alignmentOnly && !options.force ? 'right' : undefined));
      y += line.height;
    }
    y += options.after ?? 8;
  }

  async function table(node: MarkdownTable, indent: number) {
    const columns = Math.max(1, ...node.children.map(row => row.children.length));
    if (columns > 50) throw new RichContentError('PDF_TABLE_TOO_WIDE');
    const effectiveIndent = Math.min(indent, contentWidth / 2);
    const width = contentWidth - effectiveIndent, cellWidth = width / columns, padding = Math.min(6, cellWidth / 8);
    let repeatedHeaderHeight = 0;
    const prepareRow = async (rowIndex: number) => {
      const cells: { lines: Line[]; direction: 'ltr' | 'rtl' }[] = [];
      for (const cell of node.children[rowIndex].children) {
        const pieces = await inlines(cell.children, rowIndex ? {} : { bold: true });
        cells.push({ lines: wrap(pieces, cellWidth - padding * 2, fontSize, bottom - pdfPage.top - padding * 2 - 4 - (rowIndex ? repeatedHeaderHeight : 0)), direction: directionFor(pieces.map(piece => piece.text).join('')) });
      }
      return cells;
    };
    const tableDirection = directionFor(node.children.flatMap(row => row.children.flatMap(cell => cell.children.map(child => 'value' in child ? child.value : ''))).join(' '));
    const x = pdfPage.left + (tableDirection === 'ltr' ? effectiveIndent : 0);
    type PreparedRow = Awaited<ReturnType<typeof prepareRow>>;
    const rowHeight = (row: PreparedRow) => Math.max(...row.map(cell => cell.lines.reduce((sum, line) => sum + line.height, 0)), 17) + padding * 2;
    const renderRow = (row: PreparedRow, header: boolean) => {
      // Oversized rows continue at line boundaries with their cell borders.
      const cursors = row.map(() => 0);
      while (row.some((cell, column) => cursors[column] < cell.lines.length)) {
        ensure(Math.max(17, fontSize * 1.45) + padding * 2);
        const space = bottom - y - padding * 2;
        const fragments = row.map(({ lines, direction }, column) => {
          const result: Line[] = []; let height = 0;
          while (cursors[column] < lines.length && height + lines[cursors[column]].height <= space) { const line = lines[cursors[column]++]; result.push(line); height += line.height; }
          return { lines: result, direction };
        });
        if (!fragments.some(cell => cell.lines.length)) {
          // A tall picture may need the whole page after a repeated header.
          // Move it intact, without clipping or changing its aspect ratio.
          if (y > pdfPage.top) { page(); continue; }
          throw new RichContentError('PDF_CELL_TOO_LARGE');
        }
        const height = rowHeight(fragments);
        fragments.forEach(({ lines, direction }, column) => {
          const cellX = x + (tableDirection === 'rtl' ? columns - column - 1 : column) * cellWidth;
          if (header) doc.save().fillColor('#e7f1ee').rect(cellX, y, cellWidth, height).fill().restore();
          doc.save().lineWidth(0.5).strokeColor('#cadbd4').rect(cellX, y, cellWidth, height).stroke().restore();
          let top = y + padding;
          for (const line of lines) { drawLine(line, cellX + padding, top, cellWidth - padding * 2, direction, node.align?.[column] || undefined); top += line.height; }
        });
        y += height;
        if (row.some((cell, column) => cursors[column] < cell.lines.length)) page();
      }
    };
    const header = node.children.length ? await prepareRow(0) : undefined;
    if (header && rowHeight(header) + Math.max(17, fontSize * 1.45) + padding * 2 < bottom - pdfPage.top) repeatedHeaderHeight = rowHeight(header);
    for (let index = 0; index < node.children.length; index++) {
      const row = index ? await prepareRow(index) : header!;
      const height = rowHeight(row);
      if (y + height > bottom && y > pdfPage.top) {
        page();
        if (index && header && repeatedHeaderHeight) renderRow(header, true);
      }
      renderRow(row, index === 0);
    }
    y += 10;
  }

  async function blocks(nodes: readonly RootContent[], indent = 0, quote = false): Promise<void> {
    for (const node of nodes) {
      switch (node.type) {
        case 'paragraph': await paragraph(await inlines(node.children), { indent, quote }); break;
        case 'heading': await paragraph(await inlines(node.children, { bold: true, color: '#183d36' }), { indent, size: documentHeadingSize(fontSize, node.depth), before: 13, after: 8, keepNext: true }); break;
        case 'blockquote': await blocks(node.children, indent + 15, true); break;
        case 'list': {
          for (let index = 0; index < node.children.length; index++) {
            const item = node.children[index]; let first = true;
            const marker = item.checked != null ? item.checked ? '☑' : '☐' : node.ordered ? `${(node.start || 1) + index}.` : '•';
            for (const child of item.children) {
              if (child.type === 'paragraph') { await paragraph(await inlines(child.children), { indent: indent + 25, marker: first ? marker : undefined, after: 5, quote }); first = false; }
              else await blocks([child], indent + 25, quote);
            }
          }
          y += 3; break;
        }
        case 'table': await table(node, indent); break;
        case 'math': await paragraph([{ text: '\ufffc', picture: await picture(node.value, true) }], { indent, force: 'ltr', align: 'center' }); break;
        case 'code': {
          if (mathLanguage(node.lang)) { await paragraph([{ text: '\ufffc', picture: await picture(node.value, true) }], { indent, force: 'ltr', align: 'center' }); break; }
          if (node.lang?.toLowerCase() === 'mermaid') {
            const diagram = await (assets.diagram || renderMermaid)(node.value);
            await paragraph([{ text: '\ufffc', picture: accountPicture({ png: diagram.png, width: diagram.width * 72 / 96, height: diagram.height * 72 / 96 }) }], { indent, force: 'ltr', align: 'center' }); break;
          }
          const highlighted = highlightCode(node.value, node.lang);
          await paragraph([{ text: highlighted.label, code: true, bold: true }], { size: 8, indent, force: 'ltr', fill: '#e7edeb', before: 8, after: 0, keepNext: true });
          for (const line of highlighted.lines) await paragraph(line.length ? line.map(token => ({ text: token.text.replace(/\t/g, '  '), code: true, color: '#' + token.color, bold: token.bold, italic: token.italic })) : [{ text: ' ', code: true }], { size: documentLayout.code.fontSize, indent, force: 'ltr', fill: '#f1f4f5', after: 0 });
          y += 8; break;
        }
        case 'thematicBreak': ensure(12); doc.save().lineWidth(0.6).strokeColor('#cedbd7').moveTo(pdfPage.left, y + 5).lineTo(pdfPage.width - pdfPage.right, y + 5).stroke().restore(); y += 16; break;
        case 'html': await paragraph([{ text: node.value }], { indent }); break;
        case 'footnoteDefinition': await paragraph([{ text: `[${node.label || node.identifier}]`, bold: true }], { indent }); await blocks(node.children, indent + 15); break;
        case 'definition': break;
      }
    }
  }
  try { await blocks(root.children); doc.end(); return await finished; }
  catch (error) { doc.end(); await finished.catch(() => undefined); throw error; }
}
