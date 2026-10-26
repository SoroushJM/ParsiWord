import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createWord, defaultSettings, exportPreparedWord, exportWord } from './converter';
import { exportPdf, exportPreparedPdf, pdfPage } from './pdf-export';
import { markdownContext, markdownParser } from './markdown';
import { documentLayout } from './document-layout';
import { renderTikz } from './tikz';
import type { Diagram } from './diagrams';
import type { FontBundle } from './fonts';

// Engine compilation is covered by its browser integration tests. These tests
// read the actual exported document containers and physical drawing operators.
vi.mock('./tikz', () => ({ renderTikz: vi.fn() }));
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64'));
const otherPng = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAYAAAChS3wfAAAAYElEQVR4nO3QMQEAIAgAMOIYw9PABKIJxuBgxwos6r6edG6NCgECBAgQIECAAAECBAgQIECAAAECBAgQIGBTQL6edLJGCRAgQIAAAQIECBAgQIAAAQIECBAgQIAAAYsCPgHNzcMN6g4/AAAAAElFTkSuQmCC', 'base64'));
const source = String.raw`\begin{tikzpicture}
\draw (0,0) circle (2);
\draw (0,0) -- (2,0) node[right] {$A$};
\draw (0,0) -- (60:2) node[above] {$B$};
\end{tikzpicture}`;
const diagram = (width = 160, height = 100, bytes = png): Diagram => ({ png: bytes, width, height, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' });
const fence = (body = source, language = 'tikz') => `\`\`\`${language}\n${body}\n\`\`\``;
let fonts: FontBundle[];
beforeAll(async () => {
  fonts = [{ family: 'Vazirmatn', arabic: true, savedAt: 0,
    regular: await readFile('packages/core/public/fonts/Vazirmatn-Regular.ttf'),
    bold: await readFile('packages/core/public/fonts/Vazirmatn-Bold.ttf') }];
});
beforeEach(() => { vi.mocked(renderTikz).mockReset().mockResolvedValue(diagram()); });

async function readWord(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')!.async('string');
  return { zip, xml, document: new DOMParser().parseFromString(xml, 'application/xml') };
}
const elements = (element: Pick<ReturnType<DOMParser['parseFromString']>, 'getElementsByTagName'>, tag: string) => Array.from(element.getElementsByTagName(tag));

describe('TikZ export embeds diagrams without flattening the surrounding document', () => {
  it('embeds actual Word image bytes and source alt text while keeping text and equations editable', async () => {
    const markdown = `**متن قابل ویرایش** WORD_TIKZ_TEXT $x^2$\n\n${fence(source, 'TiKz')}\n\n${fence(source, 'tikzpicture')}\n`;
    const context = markdownContext(markdown.replace(/\n/g, '\r\n'));
    const canonicalBody = source.replace(/\n/g, '\r\n');
    const { zip, document, xml } = await readWord(await exportPreparedWord(context, defaultSettings));
    expect(vi.mocked(renderTikz)).toHaveBeenCalledExactlyOnceWith(canonicalBody);
    expect(elements(document, 'w:drawing')).toHaveLength(2);
    const media = zip.file(/^word\/media\/.*\.png$/);
    expect(media).toHaveLength(1); expect(await media[0].async('uint8array')).toEqual(png);
    const metadata = elements(document, 'wp:docPr');
    // XML attribute normalization converts literal line endings to spaces;
    // check both the parsed alt description and the exact stored source bytes.
    expect(metadata.every(node => node.getAttribute('descr') === source.replace(/\n/g, ' ') && node.getAttribute('title') === 'TikZ diagram')).toBe(true);
    expect(xml).toContain(`descr="${canonicalBody}"`);
    expect(elements(document, 'w:t').map(node => node.textContent).join('')).toContain('WORD_TIKZ_TEXT');
    expect(elements(document, 'w:b').length).toBeGreaterThan(0);
    expect(elements(document, 'm:oMath')).toHaveLength(1);
    expect(xml).not.toContain('[تصویر:');
    for (const paragraph of elements(document, 'w:p').filter(node => node.getElementsByTagName('w:drawing').length)) {
      expect(paragraph.getElementsByTagName('w:spacing')[0].getAttribute('w:lineRule')).toBe('atLeast');
    }
    expect(context.source).toBe(markdown.replace(/\n/g, '\r\n'));
  });

  it('keeps Mermaid and TikZ resources separate even when their source bodies are identical, using one canonical parse', async () => {
    const parse = vi.spyOn(markdownParser, 'parse');
    try {
      const context = markdownContext(`${fence(source, 'mermaid')}\n\n${fence()}`);
      const mermaid = vi.fn(async () => diagram(30, 20, otherPng));
      const tikz = vi.fn(async () => diagram());
      const { zip, document } = await readWord(await exportPreparedWord(context, defaultSettings, [], mermaid, undefined, undefined, tikz));
      expect(parse).toHaveBeenCalledTimes(1);
      expect(mermaid).toHaveBeenCalledExactlyOnceWith(source); expect(tikz).toHaveBeenCalledExactlyOnceWith(source);
      expect(elements(document, 'wp:docPr').map(node => node.getAttribute('title'))).toEqual(['Mermaid diagram', 'TikZ diagram']);
      const images = await Promise.all(zip.file(/^word\/media\/.*\.png$/).map(file => file.async('uint8array')));
      expect(images).toHaveLength(2); expect(images).toEqual(expect.arrayContaining([png, otherPng]));
      expect(vi.mocked(renderTikz)).not.toHaveBeenCalled();
    } finally { parse.mockRestore(); }
  });

  it('fits large Word diagrams to page, list and quote widths without changing their aspect ratio', async () => {
    const wide = String.raw`\draw (0,0) -- (100,1);`, tall = String.raw`\draw (0,0) -- (1,100);`;
    const markdown = `- Outer list\n  - Nested list\n\n${fence(wide).split('\n').map(line => `    ${line}`).join('\n')}\n\n${fence(wide).split('\n').map(line => `> > > ${line}`).join('\n')}\n\n${fence(tall)}`;
    const { document } = await readWord(await exportWord(markdown, defaultSettings, [], undefined, undefined, undefined,
      async body => body === wide ? diagram(2400, 1200) : diagram(1000, 6000)));
    const extents = elements(document, 'wp:extent').map(node => ({ width: Number(node.getAttribute('cx')), height: Number(node.getAttribute('cy')) }));
    expect(extents).toHaveLength(3);
    const pageWidth = documentLayout.width - documentLayout.margins.left - documentLayout.margins.right;
    const pageHeight = documentLayout.height - documentLayout.margins.top - documentLayout.margins.bottom;
    expect(extents[0].width).toBeLessThanOrEqual((pageWidth - 880) * 635);
    expect(extents[1].width).toBeLessThanOrEqual((pageWidth - 1200) * 635);
    for (const [index, size] of extents.entries()) {
      expect(size.width).toBeLessThanOrEqual(pageWidth * 635); expect(size.height).toBeLessThan(pageHeight * 635);
      expect(size.width / size.height).toBeCloseTo(index === 2 ? 1 / 6 : 2, 4);
    }
  });

  it('rejects missing prepared Word diagrams and invalid renderer dimensions instead of exporting a code substitute', async () => {
    expect(() => createWord(fence(), defaultSettings)).toThrow(expect.objectContaining({ code: 'DIAGRAM_NOT_READY' }));
    for (const invalid of [diagram(Infinity, 10), diagram(10, 0), diagram(10, 10, new Uint8Array())]) {
      await expect(exportWord(fence(), defaultSettings, [], undefined, undefined, undefined, async () => invalid))
        .rejects.toThrow(expect.objectContaining({ code: 'DIAGRAM_NOT_READY' }));
    }
  });

  it('stops Word diagram preparation at the aggregate decoded image budget and charges repeated sources only once', async () => {
    // Only the PNG metadata is needed: this must fail before decoding/packing
    // the oversized second unique resource, without allocating a large bitmap.
    const largeHeader = png.slice(), header = new DataView(largeHeader.buffer);
    header.setUint32(16, 4000); header.setUint32(20, 4000);
    const tikz = vi.fn(async (_body: string) => diagram(4000, 4000, largeHeader));
    const markdown = `${fence()}\n\n${fence()}\n\n${fence(`${source}\n% unique diagram`)}\n\n${fence('never rendered')}`;
    await expect(exportWord(markdown, defaultSettings, [], undefined, undefined, undefined, tikz))
      .rejects.toThrow(expect.objectContaining({ code: 'TIKZ_TOO_LARGE' }));
    expect(tikz).toHaveBeenCalledTimes(2);
    expect(tikz.mock.calls.map(call => call[0])).not.toContain('never rendered');
  });

  it('exports real PDF image operators and Figure source alt text alongside searchable prose and math', async () => {
    const markdown = `PDF_TIKZ_SEARCHABLE $x^2$\n\n${fence()}\n\n${fence(source, 'TIKZPICTURE')}\n\nPDF_TIKZ_FINAL`;
    const context = markdownContext(markdown.replace(/\n/g, '\r\n'));
    const canonicalBody = source.replace(/\n/g, '\r\n');
    const formula = vi.fn(async () => ({ png: otherPng, width: 25, height: 15 }));
    const pdf = await getDocument({ data: await exportPreparedPdf(context, defaultSettings, fonts, { formula }), disableFontFace: true, useSystemFonts: false, isEvalSupported: false }).promise;
    try {
      let text = '', pictures = 0; const alts: string[] = [];
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index);
        text += (await page.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
        pictures += (await page.getOperatorList()).fnArray.filter(operation => operation === OPS.paintImageXObject).length;
        const collect = (node: { role?: string; alt?: string; children?: unknown[] }) => {
          if (node.role === 'Figure' && node.alt) alts.push(node.alt);
          node.children?.forEach(child => collect(child as Parameters<typeof collect>[0]));
        };
        const tree = await page.getStructTree(); if (tree) collect(tree);
      }
      expect(text).toContain('PDF_TIKZ_SEARCHABLE'); expect(text).toContain('PDF_TIKZ_FINAL');
      expect(text).not.toContain('begin{tikzpicture}');
      expect(pictures).toBe(3); expect(alts).toEqual([`TikZ diagram\n${canonicalBody}`, `TikZ diagram\n${canonicalBody}`]);
      expect(vi.mocked(renderTikz)).toHaveBeenCalledExactlyOnceWith(canonicalBody);
      expect(formula).toHaveBeenCalledExactlyOnceWith('x^2', false, defaultSettings.fontSize);
      expect(context.source).toBe(markdown.replace(/\n/g, '\r\n'));
    } finally { await pdf.destroy(); }
  });

  it('fits tall and wide PDF diagrams inside the physical page even in quotes and lists', async () => {
    const wide = String.raw`\draw (0,0) -- (100,1);`, tall = String.raw`\draw (0,0) -- (1,100);`;
    const markdown = `${fence(wide).split('\n').map(line => `> > ${line}`).join('\n')}\n\n- List\n\n${fence(tall).split('\n').map(line => `  ${line}`).join('\n')}\n\nAFTER_BOUNDED_TIKZ`;
    const tikz = vi.fn(async (body: string) => body === wide ? diagram(10000, 200) : diagram(200, 10000));
    const pdf = await getDocument({ data: await exportPdf(markdown, defaultSettings, fonts, { tikz }), disableFontFace: true, useSystemFonts: false, isEvalSupported: false }).promise;
    try {
      let pictures = 0, text = '';
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index), operators = await page.getOperatorList();
        text += (await page.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
        let matrix = [1, 0, 0, 1, 0, 0]; const stack: number[][] = [];
        for (let i = 0; i < operators.fnArray.length; i++) {
          const operation = operators.fnArray[i], args = operators.argsArray[i];
          if (operation === OPS.save) stack.push([...matrix]);
          else if (operation === OPS.restore) matrix = stack.pop()!;
          else if (operation === OPS.transform) matrix = Util.transform(matrix, args as number[]);
          else if (operation === OPS.paintImageXObject) {
            pictures++;
            const points = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([x, y]) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]]);
            expect(Math.min(...points.map(point => point[0]))).toBeGreaterThanOrEqual(pdfPage.left - 1);
            expect(Math.max(...points.map(point => point[0]))).toBeLessThanOrEqual(pdfPage.width - pdfPage.right + 1);
            expect(Math.min(...points.map(point => point[1]))).toBeGreaterThanOrEqual(pdfPage.bottom - 1);
            expect(Math.max(...points.map(point => point[1]))).toBeLessThanOrEqual(pdfPage.height - pdfPage.top + 1);
          }
        }
      }
      expect(pictures).toBe(2); expect(text).toContain('AFTER_BOUNDED_TIKZ'); expect(tikz).toHaveBeenCalledTimes(2);
    } finally { await pdf.destroy(); }
  });

  it('reuses one embedded PDF image resource for repeated TikZ drawings', async () => {
    const markdown = [fence(), 'BETWEEN_FIRST_AND_SECOND', fence(), 'BETWEEN_SECOND_AND_THIRD', fence()].join('\n\n');
    const tikz = vi.fn(async () => diagram(90, 60, otherPng));
    const pdf = await getDocument({ data: await exportPdf(markdown, defaultSettings, fonts, { tikz }), disableFontFace: true, useSystemFonts: false, isEvalSupported: false }).promise;
    try {
      expect(pdf.numPages).toBe(1);
      const page = await pdf.getPage(1), operators = await page.getOperatorList();
      const resources = operators.fnArray.flatMap((operation, index) => operation === OPS.paintImageXObject ? [operators.argsArray[index][0]] : []);
      // All three placements stay visible, while the actual PNG is decoded and
      // stored once. Renderer deduplication alone does not guarantee this.
      expect(resources).toHaveLength(3); expect(new Set(resources).size).toBe(1);
      expect(tikz).toHaveBeenCalledExactlyOnceWith(source);
      const text = (await page.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
      expect(text).toContain('BETWEEN_FIRST_AND_SECOND'); expect(text).toContain('BETWEEN_SECOND_AND_THIRD');
    } finally { await pdf.destroy(); }
  });

  it('keeps the TikZ and Mermaid PDF renderers distinct and reuses one prepared parse', async () => {
    const parse = vi.spyOn(markdownParser, 'parse');
    try {
      const context = markdownContext(`${fence(source, 'mermaid')}\n\n${fence()}`);
      const mermaid = vi.fn(async () => diagram(30, 20, otherPng)), tikz = vi.fn(async () => diagram());
      const bytes = await exportPreparedPdf(context, defaultSettings, fonts, { diagram: mermaid, tikz });
      expect(bytes.byteLength).toBeGreaterThan(1000);
      expect(parse).toHaveBeenCalledTimes(1); expect(mermaid).toHaveBeenCalledExactlyOnceWith(source); expect(tikz).toHaveBeenCalledExactlyOnceWith(source);
      expect(vi.mocked(renderTikz)).not.toHaveBeenCalled();
    } finally { parse.mockRestore(); }
  });

  it('propagates failed TikZ compilation through Word and PDF, and rejects invalid PDF image dimensions', async () => {
    const failure = Object.assign(new Error('TikZ compilation failed'), { code: 'TIKZ_RENDER_FAILED' });
    const fail = async () => { throw failure; };
    await expect(exportWord(fence(), defaultSettings, [], undefined, undefined, undefined, fail)).rejects.toBe(failure);
    await expect(exportPdf(fence(), defaultSettings, fonts, { tikz: fail })).rejects.toBe(failure);
    for (const invalid of [diagram(NaN, 10), diagram(10, 0), diagram(10, 10, new Uint8Array())]) {
      await expect(exportPdf(fence(), defaultSettings, fonts, { tikz: async () => invalid }))
        .rejects.toThrow(expect.objectContaining({ code: 'PDF_IMAGE_INVALID' }));
    }
  });
});
