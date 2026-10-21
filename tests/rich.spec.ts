import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const source = '# فرمول و نمودار\n\nرابطهٔ $E=mc^2$ برقرار است.\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n```mermaid\nflowchart TD\n  A[نوشتن Markdown] --> B{بررسی متن}\n  B -->|تأیید| C[خروجی Word]\n  B -->|اصلاح| A\n```\n\n```mermaid\nsequenceDiagram\n  participant A as نویسنده\n  participant B as پارسی‌ورد\n  A->>B: Markdown\n  B-->>A: Word\n```';

test('offline math and Mermaid previews produce native Word equations and real PNG diagrams', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  await page.goto('/');
  await page.getByRole('textbox', { name: 'متن Markdown' }).fill(source);
  await page.getByRole('tab', { name: 'پیش‌نمایش' }).click();
  await expect(page.locator('.katex')).toHaveCount(2);
  await expect(page.locator('.mermaid-diagram svg')).toHaveCount(2, { timeout: 30000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).click();
  const download = await downloadPromise;
  const bytes = await readFile((await download.path())!);
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml.match(/<m:oMath[ >]/g)).toHaveLength(2);
  expect(xml).toContain('<m:f>'); expect(xml).toContain('<m:nary>');
  expect(xml).not.toContain('undefined');
  const images = zip.file(/word\/media\/.*\.png$/);
  expect(images).toHaveLength(2);
  for (const image of images) {
    const png = await image.async('nodebuffer');
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBeGreaterThan(100);
    expect(png.readUInt32BE(20)).toBeGreaterThan(100);
  }
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/ParsiWord-0.4.1-LaTeX-Mermaid-demo.docx', bytes);
  await writeFile('artifacts/ParsiWord-0.4.1-LaTeX-Mermaid-demo.md', source);
  await page.screenshot({ path: testInfo.outputPath('rich-preview.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('invalid diagrams and formulas are visible and block a misleading export', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'متن Markdown' }).fill('```mermaid\nthis is not a diagram\n```');
  await page.getByRole('tab', { name: 'پیش‌نمایش' }).click();
  await expect(page.getByRole('alert')).toContainText('نمودار Mermaid رسم نشد', { timeout: 30000 });
  await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).click();
  await expect(page.locator('[data-sonner-toast]')).toContainText('نمودار Mermaid رسم نشد');
  await page.getByRole('tab', { name: 'ویرایش متن', exact: true }).click();
  await page.getByRole('textbox', { name: 'متن Markdown' }).fill('$\\notARealCommand{x}$');
  await page.getByRole('tab', { name: 'پیش‌نمایش' }).click();
  await expect(page.getByRole('alert')).toContainText('فرمول LaTeX معتبر نیست');
  await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).click();
  await expect(page.locator('[data-sonner-toast]').last()).toContainText('فرمول LaTeX معتبر نیست');
});
