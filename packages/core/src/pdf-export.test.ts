import { beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { defaultSettings } from './converter';
import { exportPdf, pdfPage, pdfVisualRuns } from './pdf-export';
import type { FontBundle } from './fonts';

let fonts: FontBundle[];
beforeAll(async () => {
  fonts = await Promise.all([{ family: 'Vazirmatn', arabic: true, file: 'Vazirmatn' }, { family: 'Noto Sans Mono', arabic: false, file: 'NotoSansMono' }].map(async font => ({ family: font.family, arabic: font.arabic, regular: await readFile(`packages/core/public/fonts/${font.file}-Regular.ttf`), bold: await readFile(`packages/core/public/fonts/${font.file}-Bold.ttf`), savedAt: 0 })));
});

async function inspect(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice(), useSystemFonts: false, disableFontFace: true, isEvalSupported: false }).promise;
  try {
    const pages = [];
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index), content = await page.getTextContent();
      pages.push({ view: page.view, items: content.items.filter(item => 'str' in item) });
    }
    return { pages, text: pages.flatMap(page => page.items.map(item => item.str)).join(' ').normalize('NFKC') };
  } finally { await pdf.destroy(); }
}

describe('offline downloadable PDF', () => {
  it('orders mixed bidi runs without reversing logical Arabic before shaping', () => {
    const runs = pdfVisualRuns([{ text: 'شروع ' }, { text: '(React 19)' }, { text: ' پایان' }], 'rtl');
    expect(runs.map(run => run.text).join('')).toBe(' پایان(React 19)شروع ');
    expect(runs.filter(run => run.level % 2).some(run => run.text.includes('شروع'))).toBe(true);
  });

  it('embeds fonts and keeps Persian/Latin searchable on the same physical page as Word', async () => {
    const bytes = await exportPdf('# گزارش فارسی\n\nمتن فارسی (React 19) پایان.\n\nPDFSEARCH42 searchable English.', defaultSettings, fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(Buffer.from(bytes).toString('latin1')).toContain('/FontFile2');
    const result = await inspect(bytes);
    expect(result.pages).toHaveLength(1);
    expect(result.text).toContain('فارسی');
    expect(result.text.replace(/\s+/g, ' ')).toContain('React 19');
    expect(result.text).toContain('PDFSEARCH42');
    expect(result.pages[0].view).toEqual([0, 0, pdfPage.width, pdfPage.height]);
    const item = result.pages[0].items.find(item => item.str.includes('PDFSEARCH42'))!;
    expect(Math.hypot(item.transform[0], item.transform[1])).toBeCloseTo(12);
  });

  it('applies the selected font/size and preserves Arabic fallback', async () => {
    const bytes = await exportPdf('فارسی و PDFSEARCH18', { ...defaultSettings, fontFamily: 'Noto Sans Mono', fontSize: 18, direction: 'ltr' }, fonts);
    const result = await inspect(bytes);
    expect(result.text).toContain('فارسی');
    expect(result.text).toContain('PDFSEARCH18');
    expect(Buffer.from(bytes).toString('latin1')).toContain('NotoSansMono');
    expect(Math.hypot(...result.pages[0].items.find(item => item.str.includes('PDFSEARCH18'))!.transform.slice(0, 2))).toBeCloseTo(18);
  });

  it('paginates long code/lists/tables without clipping text or losing the final content', async () => {
    const rows = Array.from({ length: 90 }, (_, index) => `| ردیف ${index} | TABLEVALUE${index} محتوای خانه |`).join('\n');
    const code = Array.from({ length: 80 }, (_, index) => `const CODEVALUE${index} = "${'long'.repeat(45)}";`).join('\n');
    const bytes = await exportPdf(`- اولین مورد فارسی (React 19)\n- دوم\n\n| سرستون | HEADERSEARCH |\n| --- | --- |\n${rows}\n\n\`\`\`js\n${code}\n\`\`\`\n\nFINALMARKER`, defaultSettings, fonts);
    const result = await inspect(bytes);
    expect(result.pages.length).toBeGreaterThan(4);
    expect(result.text).toContain('TABLEVALUE89');
    expect(result.text).toContain('CODEVALUE79');
    expect(result.text).toContain('FINALMARKER');
    expect(result.text.match(/HEADERSEARCH/g)!.length).toBeGreaterThan(1);
    for (const page of result.pages) for (const item of page.items) if (item.str.trim()) {
      expect(item.transform[4]).toBeGreaterThanOrEqual(pdfPage.left - 26);
      expect(item.transform[4] + item.width).toBeLessThanOrEqual(pdfPage.width - pdfPage.right + 1);
      expect(item.transform[5]).toBeGreaterThanOrEqual(pdfPage.bottom - 1);
      expect(item.transform[5]).toBeLessThanOrEqual(pdfPage.height - pdfPage.top + 1);
    }
  });

  it('embeds locally rendered formula/diagram pictures and propagates invalid content errors', async () => {
    // One opaque 1x1 PNG is enough to verify actual image objects coexist with
    // vector text; browser coverage checks the real KaTeX/Mermaid appearance.
    const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=', 'base64'));
    const bytes = await exportPdf('قبل $x^2$ بعد\n\n$$\nx+y\n$$\n\n```mermaid\ngraph LR; A-->B\n```\n\nSEARCHAFTERPICTURES', defaultSettings, fonts, { formula: async () => ({ png, width: 25, height: 15 }), diagram: async () => ({ png, width: 100, height: 80, svg: '<svg/>' }) });
    expect(Buffer.from(bytes).toString('latin1')).toContain('/Subtype /Image');
    expect((await inspect(bytes)).text).toContain('SEARCHAFTERPICTURES');
    await expect(exportPdf('$bad$', defaultSettings, fonts, { formula: async () => { throw new Error('invalid formula'); } })).rejects.toThrow('invalid formula');
    await expect(exportPdf('```mermaid\nbad\n```', defaultSettings, fonts, { diagram: async () => { throw new Error('invalid diagram'); } })).rejects.toThrow('invalid diagram');
  });

  it('rejects a table column narrower than one glyph rather than overflowing the page', async () => {
    const header = `| ${Array(50).fill('a').join(' | ')} |`;
    const separator = `| ${Array(50).fill('---').join(' | ')} |`;
    const row = `| ${[...Array(49).fill('a'), 'W'].join(' | ')} |`;
    await expect(exportPdf(`${header}\n${separator}\n${row}`, defaultSettings, fonts)).rejects.toThrow('عرض یک ستون');
  });
});
