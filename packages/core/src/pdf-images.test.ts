import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { exportPdf, pdfPage } from './pdf-export';
import { defaultSettings } from './converter';
import { prepareExportImages } from './export-images';
import type { FontBundle } from './fonts';

vi.mock('./export-images', () => ({ prepareExportImages: vi.fn() }));
const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64'));
let fonts: FontBundle[];
beforeAll(async () => { fonts = [{ family: 'Vazirmatn', arabic: true, regular: await readFile('packages/core/public/fonts/Vazirmatn-Regular.ttf'), savedAt: 0 }]; });
beforeEach(() => { vi.mocked(prepareExportImages).mockReset(); });

describe('PDF Markdown image layout', () => {
  it.each([1, 2])('keeps a table header with each tall portrait image in exactly %i page(s)', async count => {
    vi.mocked(prepareExportImages).mockResolvedValue(new Map([['portrait.png', { png, width: 24, height: 8000 }]]));
    const markdown = ['| PORTRAIT_HEADER42 |', '| --- |', ...Array.from({ length: count }, () => '| ![Portrait](portrait.png) |')].join('\n');
    const pdf = await getDocument({ data: await exportPdf(markdown, defaultSettings, fonts), disableFontFace: true, useSystemFonts: false, isEvalSupported: false }).promise;
    try {
      expect(pdf.numPages).toBe(count);
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index);
        const text = (await page.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
        const operators = await page.getOperatorList();
        expect(text).toContain('PORTRAIT_HEADER42');
        expect(operators.fnArray.filter(operation => operation === OPS.paintImageXObject)).toHaveLength(1);
      }
    } finally { await pdf.destroy(); }
  });

  it('embeds inline, reference, linked, list and tall table pictures within the physical page and keeps text searchable', async () => {
    vi.mocked(prepareExportImages).mockResolvedValue(new Map([
      ['wide.png', { png, width: 2400, height: 200 }], ['tall.png', { png, width: 24, height: 8000 }],
    ]));
    const markdown = 'قبل ![wide](wide.png) بعد SEARCHABLE_IMAGE_EXPORT\n\n- [![linked][pic]](https://example.com/image)\n\n| Header |\n| --- |\n| ![portrait](tall.png) |\n\nFINAL_IMAGE_TEXT\n\n[pic]: wide.png';
    const pdf = await getDocument({ data: await exportPdf(markdown, defaultSettings, fonts), disableFontFace: true, useSystemFonts: false, isEvalSupported: false }).promise;
    try {
      let count = 0, text = ''; const links: unknown[] = [];
      for (let index = 1; index <= pdf.numPages; index++) {
        const page = await pdf.getPage(index), operators = await page.getOperatorList();
        text += (await page.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
        links.push(...(await page.getAnnotations()).filter(item => item.url === 'https://example.com/image'));
        let matrix = [1, 0, 0, 1, 0, 0]; const stack: number[][] = [];
        for (let i = 0; i < operators.fnArray.length; i++) {
          const operation = operators.fnArray[i], args = operators.argsArray[i];
          if (operation === OPS.save) stack.push([...matrix]);
          else if (operation === OPS.restore) matrix = stack.pop()!;
          else if (operation === OPS.transform) matrix = Util.transform(matrix, args as number[]);
          else if (operation === OPS.paintImageXObject) {
            count++;
            const points = [[0, 0], [0, 1], [1, 0], [1, 1]].map(([x, y]) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]]);
            expect(Math.min(...points.map(point => point[0]))).toBeGreaterThanOrEqual(pdfPage.left - 1);
            expect(Math.max(...points.map(point => point[0]))).toBeLessThanOrEqual(pdfPage.width - pdfPage.right + 1);
            expect(Math.min(...points.map(point => point[1]))).toBeGreaterThanOrEqual(pdfPage.bottom - 1);
            expect(Math.max(...points.map(point => point[1]))).toBeLessThanOrEqual(pdfPage.height - pdfPage.top + 1);
          }
        }
      }
      expect(count).toBe(3); expect(pdf.numPages).toBeGreaterThan(1);
      expect(text).toContain('SEARCHABLE_IMAGE_EXPORT'); expect(text).toContain('FINAL_IMAGE_TEXT');
      expect(links).toHaveLength(1); expect(text).not.toContain('[تصویر:');
    } finally { await pdf.destroy(); }
  });
  it('passes the canonical context and host image services through, and propagates resource errors', async () => {
    vi.mocked(prepareExportImages).mockRejectedValue(new Error('image unavailable'));
    const resolveImage = vi.fn(), readImage = vi.fn();
    await expect(exportPdf('![missing](./missing.png)', defaultSettings, fonts, { resolveImage, readImage })).rejects.toThrow('image unavailable');
    expect(prepareExportImages).toHaveBeenCalledWith(expect.objectContaining({ source: '![missing](./missing.png)' }), resolveImage, readImage);
  });
});
