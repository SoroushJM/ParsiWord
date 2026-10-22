import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { defaultSettings } from './converter';
import { exportPdf, pdfPage } from './pdf-export';
import type { FontBundle } from './fonts';

let fonts: FontBundle[];
beforeAll(async () => {
  fonts = [{
    family: 'Vazirmatn', arabic: true, savedAt: 0,
    regular: await readFile('packages/core/public/fonts/Vazirmatn-Regular.ttf'),
    bold: await readFile('packages/core/public/fonts/Vazirmatn-Bold.ttf'),
  }];
});

async function readPdf(bytes: Uint8Array) {
  const document = await getDocument({ data: bytes.slice(), useSystemFonts: false, disableFontFace: true, isEvalSupported: false }).promise;
  try {
    const pages = [];
    for (let index = 1; index <= document.numPages; index++) {
      const content = await (await document.getPage(index)).getTextContent();
      pages.push(content.items.filter(item => 'str' in item));
    }
    return { pages, text: pages.flatMap(items => items.map(item => item.str)).join(' ') };
  } finally { await document.destroy(); }
}

describe('PDF page bounds and formula resource limits', () => {
  it('keeps a deeply nested LTR table inside the shared page margins', async () => {
    const quote = '> '.repeat(24);
    const markdown = [
      `${quote}| LEFTHEADER | RIGHTHEADER |`,
      `${quote}| --- | --- |`,
      `${quote}| NESTEDLEFT42 | NESTEDRIGHT42 |`,
      '', 'AFTERNESTEDTABLE42',
    ].join('\n');
    const bytes = await exportPdf(markdown, { ...defaultSettings, direction: 'ltr' }, fonts);
    const result = await readPdf(bytes);
    expect(result.text).toContain('NESTEDLEFT42');
    expect(result.text).toContain('NESTEDRIGHT42');
    expect(result.text).toContain('AFTERNESTEDTABLE42');
    for (const items of result.pages) for (const item of items) if (item.str.trim()) {
      expect(item.transform[4], item.str).toBeGreaterThanOrEqual(pdfPage.left - 1);
      expect(item.transform[4] + item.width, item.str).toBeLessThanOrEqual(pdfPage.width - pdfPage.right + 1);
    }
  });

  it('serializes unique table-formula rendering without losing the final rows', async () => {
    const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64'));
    let active = 0, peakActive = 0, calls = 0;
    const rows = Array.from({ length: 48 }, (_, index) => `| ROWVALUE${index} $x_{${index}}$ | CELLVALUE${index} |`);
    const markdown = ['| Formula | Value |', '| --- | --- |', ...rows, '', 'AFTERALLFORMULAS42'].join('\n');
    const bytes = await exportPdf(markdown, { ...defaultSettings, direction: 'ltr' }, fonts, {
      formula: async () => {
        calls++;
        active++;
        peakActive = Math.max(peakActive, active);
        // Yield once so an unbounded Promise.all across table cells exposes
        // its simultaneous rasterizations without a timing-sensitive delay.
        await Promise.resolve();
        active--;
        return { png, width: 25, height: 15 };
      },
    });
    expect(calls).toBe(48);
    expect(peakActive).toBe(1);
    expect(active).toBe(0);
    const result = await readPdf(bytes);
    for (let index = 0; index < 48; index++) {
      expect(result.text).toContain(`ROWVALUE${index}`);
      expect(result.text).toContain(`CELLVALUE${index}`);
    }
    expect(result.text).toContain('AFTERALLFORMULAS42');
  });
});
