import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import tauri from '../apps/parsiword/src-tauri/tauri.conf.json' with { type: 'json' };

test.describe.configure({ mode: 'serial' });
const example = await readFile('examples/xepersian-exam.md', 'utf8');
const source = /```xelatex\n([\s\S]*?)\n```/.exec(example)![1];
const twoPages = source.replace('\\end{document}', '\\newpage\n\\section*{صفحهٔ دوم}\nXETEXSECONDPAGE\\par\nسؤال دوم: حاصل $\\int_0^1 x^2\\,dx$ را بیابید.\n\\end{document}');
const fence = (body: string, language = 'xelatex') => `\`\`\`${language}\n${body}\n\`\`\``;

test('real offline XePersian renders a multipage Persian exam and exports vector PDF and each Word page', async ({ page }, info) => {
  test.setTimeout(180_000);
  const markdown = `BEFORE_XETEX متن اصلی پیش از سؤال‌نامه.\n\n${fence(twoPages, 'latex')}\n\nAFTER_XETEX متن پس از سؤال‌نامه.`;
  const outside: string[] = [];
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => { outside.push(route.request().url()); return route.abort(); });
  await page.addInitScript(({ markdown, csp }) => {
    localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: {} }));
    document.addEventListener('DOMContentLoaded', () => { const meta = document.createElement('meta'); meta.httpEquiv = 'Content-Security-Policy'; meta.content = csp; document.head.append(meta); }, { once: true });
  }, { markdown, csp: tauri.app.security.csp });
  await page.goto('/'); await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.tikz-canvas > svg image')).toHaveCount(2, { timeout: 100_000 });
  await expect(page.locator('#markdown-source')).toHaveValue(markdown);
  expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('undefined');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(outside).toEqual([]);
  const pendingWord = page.waitForEvent('download', { timeout: 45_000 });
  await page.getByRole('button', { name: 'ذخیرهٔ فایل Word', exact: true }).click();
  const word = await pendingWord; await word.saveAs(info.outputPath('xepersian.docx'));
  const zip = await JSZip.loadAsync(await readFile((await word.path())!));
  expect(zip.file(/^word\/media\/.*\.png$/)).toHaveLength(2);
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('BEFORE_XETEX'); expect(xml).toContain('AFTER_XETEX');
  const meta = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('wp:docPr');
  expect(Array.from(meta).map(node => node.getAttribute('descr'))).toEqual([twoPages.replace(/\n/g, ' '), twoPages.replace(/\n/g, ' ')]);
  const pendingPdf = page.waitForEvent('download', { timeout: 45_000 });
  await page.getByRole('button', { name: 'قالب‌های دیگر خروجی', exact: true }).click();
  await page.getByRole('menuitem', { name: 'ذخیرهٔ فایل PDF', exact: true }).click();
  const download = await pendingPdf; await download.saveAs(info.outputPath('xepersian.pdf'));
  const pdf = await getDocument({ data: new Uint8Array(await readFile((await download.path())!)), isEvalSupported: false, useSystemFonts: false, disableFontFace: true }).promise;
  try {
    expect(pdf.numPages).toBe(4);
    const texts = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const sheet = await pdf.getPage(n), text = (await sheet.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
      // XeTeX uses Arabic presentation-form code points for some shaped glyphs.
      // Search/viewers normalize those compatibility forms back to plain text.
      texts.push(text.normalize('NFKC'));
      const operations = await sheet.getOperatorList();
      expect(operations.fnArray.filter(value => value === OPS.paintImageXObject)).toHaveLength(0);
    }
    expect(texts[0]).toContain('BEFORE_XETEX');
    expect(texts[1]).toContain('آزمون'); expect(texts[1]).toContain('ریاضی');
    expect(texts[2]).toContain('XETEXSECONDPAGE'); expect(texts[3]).toContain('AFTER_XETEX');
  } finally { await pdf.destroy(); }
  await expect(page.locator('#markdown-source')).toHaveValue(markdown);
});

test('nested English route shows a missing font log, then recovers to a valid full document', async ({ page }) => {
  test.setTimeout(150_000);
  const invalid = fence(source.replace('Vazirmatn-Regular.ttf', 'MissingExamFont.ttf'), 'tikz');
  await page.addInitScript(markdown => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: {} })), invalid);
  await page.goto('/en/'); await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.getByRole('alert').filter({ hasText: 'This font is not available' })).toBeVisible({ timeout: 100_000 });
  await page.getByText('XeLaTeX log', { exact: true }).click();
  await expect(page.getByRole('alert').locator('details')).toContainText('fontspec Error');
  await expect(page.locator('#markdown-source')).toHaveValue(invalid);
  await page.locator('[data-mobile-view="edit"]').click(); await page.locator('#markdown-source').fill(fence(source));
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.tikz-canvas > svg image')).toHaveCount(1, { timeout: 100_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
});
