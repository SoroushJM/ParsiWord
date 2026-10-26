import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

test('selected local image base embeds real PNG and SVG bytes into Word and PDF while preserving Markdown', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const folder = testInfo.outputPath('project'), assets = join(folder, 'assets');
  await mkdir(assets, { recursive: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAYAAAChS3wfAAAAYElEQVR4nO3QMQEAIAgAMOIYw9PABKIJxuBgxwos6r6edG6NCgECBAgQIECAAAECBAgQIECAAAECBAgQIGBTQL6edLJGCRAgQIAAAQIECBAgQIAAAQIECBAgQIAAAYsCPgHNzcMN6g4/AAAAAElFTkSuQmCC', 'base64');
  await writeFile(join(assets, 'raster.png'), png);
  await writeFile(join(assets, 'circle one.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="white"/><circle cx="120" cy="60" r="45" fill="#087f74"/></svg>');
  const markdown = '# تصاویر محلی\n\nمتن قابل جستجو SEARCHABLE_IMAGE_EXPORT\n\nقبل ![دایره][diagram] بعد\n\n- ![PNG](../assets/raster.png)\n\n[diagram]: ../assets/circle%20one.svg';
  await page.addInitScript(markdown => {
    Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true });
    localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { title: 'Images export' } }));
  }, markdown);
  await page.goto('/');
  await page.locator('.local-image-base > summary').click();
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'انتخاب پوشهٔ پایه', exact: true }).click();
  await (await picker).setFiles(folder);
  await page.getByLabel('مسیر سند نسبت به پوشهٔ انتخاب‌شده').fill('docs');
  await page.locator('[data-mobile-view="preview"]').click();
  await expect.poll(() => page.locator('.rich-markdown-image img').evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).naturalWidth))).toEqual([240, 64]);
  const wordPending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ذخیرهٔ فایل Word', exact: true }).click();
  const wordPath = (await (await wordPending).path())!;
  const zip = await JSZip.loadAsync(await readFile(wordPath));
  const xml = await zip.file('word/document.xml')!.async('string');
  expect(xml).toContain('SEARCHABLE_IMAGE_EXPORT'); expect(xml.match(/<w:drawing>/g)).toHaveLength(2);
  expect(xml).not.toContain('[تصویر:');
  const media = zip.file(/word\/media\/.*\.png$/); expect(media).toHaveLength(2);
  const sizes = await Promise.all(media.map(async file => { const bytes = await file.async('nodebuffer'); return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)]; }));
  expect(sizes).toEqual(expect.arrayContaining([[240, 120], [64, 48]]));
  await (await wordPending).saveAs(testInfo.outputPath('images.docx'));
  await page.getByRole('button', { name: 'قالب‌های دیگر خروجی', exact: true }).click();
  const pdfPending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'ذخیرهٔ فایل PDF', exact: true }).click();
  const download = await pdfPending; await download.saveAs(testInfo.outputPath('images.pdf'));
  const pdf = await getDocument({ data: new Uint8Array(await readFile((await download.path())!)), disableFontFace: true, useSystemFonts: false, isEvalSupported: false }).promise;
  try {
    let text = '', pictures = 0;
    for (let index = 1; index <= pdf.numPages; index++) {
      const first = await pdf.getPage(index), operations = await first.getOperatorList();
      text += (await first.getTextContent()).items.filter(item => 'str' in item).map(item => item.str).join(' ');
      for (let i = 0; i < operations.fnArray.length; i++) if (operations.fnArray[i] === OPS.paintImageXObject) {
        pictures++;
        const image = await new Promise<{ width: number; height: number; data: Uint8Array }>(resolve => first.objs.get(operations.argsArray[i][0] as string, resolve));
        expect(image.data.some(value => value < 180)).toBe(true);
      }
    }
    expect(pictures).toBe(2); expect(text).toContain('SEARCHABLE_IMAGE_EXPORT'); expect(text).not.toContain('[تصویر:');
  } finally { await pdf.destroy(); }
  await expect(page.locator('#markdown-source')).toHaveValue(markdown);
});

test('a missing image reports an export error instead of silently saving an incomplete Word or PDF', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: '![Missing](./missing-image.png)', settings: {} })));
  await page.goto('/');
  await page.getByRole('button', { name: 'ذخیرهٔ فایل Word', exact: true }).click();
  await expect(page.locator('[data-sonner-toast]')).toContainText(/تصویر/);
  await page.getByRole('button', { name: 'قالب‌های دیگر خروجی', exact: true }).click();
  await page.getByRole('menuitem', { name: 'ذخیرهٔ فایل PDF', exact: true }).click();
  await expect(page.locator('[data-sonner-toast]').last()).toContainText(/تصویر/);
  await expect(page.getByRole('button', { name: 'ذخیرهٔ فایل Word', exact: true })).toBeEnabled();
});
