import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

test('fresh launch renders and exports the difficult default document offline', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'متن Markdown' });
  const markdown = await editor.inputValue();
  expect(markdown).toContain('React (version **19**)');
  await page.getByRole('tab', { name: 'پیش‌نمایش' }).click();
  await expect(page.locator('.katex')).toHaveCount(5);
  await expect(page.locator('.mermaid-diagram svg')).toHaveCount(2, { timeout: 30000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  const persian = 'کتابخانهٔ React (version 19) را نصب کنید.';
  const english = 'English starts here (نسخهٔ فارسی (مرحلهٔ دوم)) and continues with React (version 19), [item 2] and number 123.';
  const delimiters = 'فارسی (توضیح)؛ فارسی [توضیح]؛ فارسی {توضیح}؛ فارسی <توضیح>.';
  for (const [text, dir] of [[persian, 'rtl'], [english, 'ltr'], [delimiters, 'rtl']]) {
    await expect(page.locator('.prose p').filter({ hasText: text })).toHaveAttribute('dir', dir);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).click();
  const bytes = await readFile((await (await downloading).path())!);
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')!.async('string');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  expect(document.getElementsByTagName('parsererror')).toHaveLength(0);
  const paragraphs = Array.from(document.getElementsByTagName('w:p')).map(p =>
    Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('').replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ''));
  for (const text of [persian, english, delimiters]) expect(paragraphs).toContain(text);
  expect(xml).toContain('<w:bidi/>');
  expect(xml).toContain('<w:bidi w:val="false"/>');
  expect(xml.match(/<m:oMath[ >]/g)).toHaveLength(5);
  expect(xml).toContain('<m:nary>');
  const sum = Array.from(document.getElementsByTagName('m:nary')).find(n => n.getElementsByTagName('m:chr')[0].getAttribute('m:val') === '∑')!;
  expect(Array.from(sum.childNodes).find(n => n.nodeName === 'm:e')!.textContent).toBe('k');
  expect(zip.file(/word\/media\/.*\.png$/)).toHaveLength(2);
  expect(zip.file(/word\/fonts\/.*\.odttf$/)).toHaveLength(6);
  const table = await zip.file('word/fontTable.xml')!.async('string');
  for (const font of ['Vazirmatn', 'Noto Sans Mono', 'STIX Two Math', 'ParsiWord Symbols']) expect(table).toContain(font);
  expect(await zip.file('word/settings.xml')!.async('string')).toContain('w:embedTrueTypeFonts');
  await mkdir('artifacts', { recursive: true });
  await writeFile(`artifacts/ParsiWord-0.4.2-default-checked-${testInfo.project.name}.docx`, bytes);
  await writeFile('artifacts/ParsiWord-0.4.2-default.md', markdown);
  await page.screenshot({ path: testInfo.outputPath('default-preview.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('a saved empty draft stays empty instead of being replaced by the starter document', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: '', settings: {} })));
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'متن Markdown' })).toHaveValue('');
  await expect(page.getByRole('button', { name: /ذخیرهٔ فایل Word/ })).toBeDisabled();
});
