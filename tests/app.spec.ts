import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

test('mobile editor, preview, persistence, samples and valid DOCX download', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('textbox', { name: 'متن Markdown' }).fill('# عنوان فارسی\n\nمتن (React 19) درست است.');
  await page.getByRole('tab', { name: 'پیش‌نمایش' }).click();
  await expect(page.locator('.prose h1')).toHaveText('عنوان فارسی');
  await page.getByRole('button', { name: 'تنظیمات خروجی' }).click();
  await page.getByLabel('نام فایل', { exact: true }).fill('آزمایش گوشی');
  await page.getByRole('radio', { name: 'خودکار', exact: true }).click();
  await page.getByRole('button', { name: 'آماده است' }).click();
  await expect(page.locator('.editor-status')).toContainText('ذخیره شد');
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'متن Markdown' })).toHaveValue('# عنوان فارسی\n\nمتن (React 19) درست است.');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('آزمایش گوشی.docx');
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  expect(await zip.file('word/document.xml')!.async('string')).toContain('React 19');
  await page.getByRole('button', { name: /متن‌های نمونه/ }).click();
  await page.getByRole('button', { name: /آزمایش پرانتزها فارسی/ }).click();
  await expect(page.getByRole('textbox', { name: 'متن Markdown' })).toHaveValue(/React \(version 19\)/);
  await page.getByRole('button', { name: 'متن قبلی' }).click();
  await expect(page.getByRole('textbox', { name: 'متن Markdown' })).toHaveValue('# عنوان فارسی\n\nمتن (React 19) درست است.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('imports markdown and allows empty draft without exporting', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({ name: 'گزارش.md', mimeType: 'text/markdown', buffer: Buffer.from('# گزارش\n\nآزمایش (۱۲۳)') });
  await expect(page.getByRole('textbox', { name: 'نام سند' })).toHaveValue('گزارش');
  await page.getByRole('button', { name: 'یادداشت تازه' }).click();
  await expect(page.getByRole('button', { name: /ذخیرهٔ فایل Word/ })).toBeDisabled();
  await page.getByRole('button', { name: 'متن قبلی' }).click();
  await expect(page.getByRole('textbox', { name: 'متن Markdown' })).toHaveValue('# گزارش\n\nآزمایش (۱۲۳)');
});

test('diagnostic direction option is reflected in generated Word', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'تنظیمات خروجی' }).click();
  await page.getByLabel('حالت مقایسه: فقط راست‌چین').check();
  await page.getByRole('button', { name: 'آماده است' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('فقط-راست-چین');
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('w:bidi w:val="false"');
});

test('Google font is selectable, embedded in Word, and reusable after reload without another download', async ({ page }) => {
  let downloads = 0;
  const font = await readFile('tests/fixtures/NotoNaskhArabic-Regular.ttf');
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', headers: { 'access-control-allow-origin': '*' }, body: '@font-face { font-family: "Noto Naskh Arabic"; src: url(https://fonts.gstatic.com/s/parsiword-test.ttf) format("truetype"); }' }));
  await page.route('https://fonts.gstatic.com/**', route => { downloads++; return route.fulfill({ contentType: 'font/ttf', headers: { 'access-control-allow-origin': '*' }, body: font }); });
  await page.goto('/');
  await page.getByRole('button', { name: 'تنظیمات خروجی' }).click();
  await page.getByRole('button', { name: 'انتخاب فونت خروجی' }).click();
  await page.getByLabel('جست‌وجو در Google Fonts').fill('Noto Naskh Arabic');
  await page.getByRole('button', { name: 'انتخاب فونت Noto Naskh Arabic', exact: true }).click();
  await expect(page.getByRole('button', { name: 'انتخاب فونت خروجی' })).toContainText('Noto Naskh Arabic');
  await page.getByRole('button', { name: 'آماده است' }).click();
  await expect(page.locator('.editor-status')).toContainText('ذخیره شد');
  expect(downloads).toBe(2);
  await page.reload();
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.getByRole('button', { name: 'تنظیمات خروجی' }).click();
  await expect(page.getByRole('button', { name: 'انتخاب فونت خروجی' })).toContainText('Noto Naskh Arabic');
  await page.getByRole('button', { name: 'آماده است' }).click();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).click();
  const download = await downloading;
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  expect(await zip.file('word/fontTable.xml')!.async('string')).toContain('Noto Naskh Arabic');
  expect(zip.file(/word\/fonts\/.*\.odttf$/)).toHaveLength(2);
  expect(downloads).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
