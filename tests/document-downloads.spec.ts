import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function startDocument(page: Page, markdown: string, title: string) {
  await page.addInitScript(({ markdown, title }) => {
    localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { title, direction: 'auto' } }));
    const createObjectURL = URL.createObjectURL.bind(URL);
    (window as unknown as { documentDownloadBlobs: { mime: string; size: number }[] }).documentDownloadBlobs = [];
    URL.createObjectURL = value => {
      if (value instanceof Blob) (window as unknown as { documentDownloadBlobs: { mime: string; size: number }[] }).documentDownloadBlobs.push({ mime: value.type, size: value.size });
      return createObjectURL(value);
    };
  }, { markdown, title });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'متن Markdown', exact: true })).toBeVisible();
}

async function downloadDocument(page: Page, format: 'PDF' | 'Markdown') {
  await page.getByRole('button', { name: 'قالب‌های دیگر خروجی', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: `ذخیرهٔ فایل ${format}`, exact: true }).click();
  const download = await downloading;
  const bytes = await readFile((await download.path())!);
  const blobs = await page.evaluate(() => (window as unknown as { documentDownloadBlobs: { mime: string; size: number }[] }).documentDownloadBlobs);
  return { filename: download.suggestedFilename(), bytes, blobs };
}

async function inspectPdf(bytes: Uint8Array) {
  const document = await getDocument({ data: Uint8Array.from(bytes), useSystemFonts: false, disableFontFace: true, isEvalSupported: false }).promise;
  try {
    const page = await document.getPage(1);
    const content = await page.getTextContent();
    const items = content.items.filter(item => 'str' in item);
    return {
      pages: document.numPages,
      width: page.view[2] - page.view[0], height: page.view[3] - page.view[1],
      text: items.map(item => item.str).join('\n').normalize('NFKC'),
      searchItem: items.find(item => item.str.includes('PDFSEARCH42')),
    };
  } finally { await document.destroy(); }
}

test('Markdown download preserves the exact logical UTF-8 source and trailing line endings', async ({ page }) => {
  const source = '# فارسی و English (React **19**)\r\n\r\n> \\*نشانه\\* و نیم‌فاصله\n\n```html\n<script>literalSourceOnly()</script>\n```\n\n$E=mc^2$  \n';
  await startDocument(page, source, 'گزارش من');
  const download = await downloadDocument(page, 'Markdown');
  expect(download.filename).toBe('گزارش من.md');
  expect(download.bytes).toEqual(Buffer.from(source, 'utf8'));
  expect(download.bytes.subarray(0, 3)).not.toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  expect(download.blobs).toContainEqual({ mime: 'text/markdown;charset=utf-8', size: Buffer.byteLength(source, 'utf8') });
  expect(await page.getByRole('textbox', { name: 'متن Markdown', exact: true }).inputValue()).toBe(source.replace(/\r\n/g, '\n'));
});

test('an empty draft can be saved as an empty Markdown file while Word and PDF stay disabled', async ({ page }) => {
  await startDocument(page, '', 'یادداشت خالی');
  await expect(page.getByRole('button', { name: /ذخیرهٔ فایل Word/ })).toBeDisabled();
  await page.getByRole('button', { name: 'قالب‌های دیگر خروجی', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'ذخیرهٔ فایل PDF', exact: true })).toBeDisabled();
  const markdown = page.getByRole('menuitem', { name: 'ذخیرهٔ فایل Markdown', exact: true });
  await expect(markdown).toBeEnabled();
  const downloading = page.waitForEvent('download');
  await markdown.click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('یادداشت خالی.md');
  expect(await readFile((await download.path())!)).toEqual(Buffer.alloc(0));
});

test('PDF download contains searchable Persian and Latin text, embedded fonts and the shared output settings', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await startDocument(page, '# گزارش\n\nمتن فارسی قابل جست‌وجو\n\nPDFSEARCH42 searchable English line.\n', 'خروجی مشترک');

  const first = await downloadDocument(page, 'PDF');
  expect(first.filename).toBe('خروجی مشترک.pdf');
  expect(first.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(first.blobs).toContainEqual({ mime: 'application/pdf', size: first.bytes.length });
  expect(first.bytes.toString('latin1')).toContain('/FontFile');
  expect(first.bytes.toString('latin1')).toContain('Vazirmatn');
  const initial = await inspectPdf(first.bytes);
  expect(initial.text).toContain('PDFSEARCH42');
  expect(initial.text).toContain('فارسی');
  expect(initial.pages).toBe(1);
  expect(initial.width).toBeCloseTo(595.3, 0);
  expect(initial.height).toBeCloseTo(841.9, 0);
  expect(initial.searchItem).toBeTruthy();
  expect(Math.hypot(initial.searchItem!.transform[0], initial.searchItem!.transform[1])).toBeCloseTo(12, 1);

  await page.getByRole('button', { name: 'تنظیمات خروجی', exact: true }).click();
  await page.getByRole('button', { name: 'انتخاب فونت خروجی', exact: true }).click();
  await page.getByRole('radio', { name: 'همه', exact: true }).click();
  await page.getByLabel('جست‌وجو در Google Fonts').fill('Noto Sans Mono');
  await page.getByRole('button', { name: 'انتخاب فونت Noto Sans Mono', exact: true }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('radio', { name: '۱۸ pt', exact: true }).click();
  await settings.getByRole('radio', { name: 'چپ‌به‌راست', exact: true }).click();
  await settings.getByRole('textbox', { name: 'نام فایل', exact: true }).fill('سند بزرگ');
  await page.getByRole('button', { name: 'آماده است', exact: true }).click();

  const second = await downloadDocument(page, 'PDF');
  expect(second.filename).toBe('سند بزرگ.pdf');
  expect(second.bytes.toString('latin1')).toContain('/FontFile');
  expect(second.bytes.toString('latin1')).toContain('NotoSansMono');
  const updated = await inspectPdf(second.bytes);
  expect(updated.text).toContain('PDFSEARCH42');
  expect(updated.text).toContain('فارسی');
  expect(updated.searchItem).toBeTruthy();
  expect(Math.hypot(updated.searchItem!.transform[0], updated.searchItem!.transform[1])).toBeCloseTo(18, 1);
  expect(updated.width).toBeCloseTo(initial.width, 2);
  expect(updated.height).toBeCloseTo(initial.height, 2);
});
