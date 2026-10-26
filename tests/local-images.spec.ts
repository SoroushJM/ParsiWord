import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

test('local image base folder resolves encoded paths and can be cleared/reselected without changing Markdown', async ({ page }, testInfo) => {
  const source = '![نمودار محلی](<./assets/diagram%20one.svg> "عنوان")\n\n![مرجع][image]\n\n[image]: ./assets/diagram%20one.svg';
  const folders = [testInfo.outputPath('base one'), testInfo.outputPath('base two')];
  for (const [index, folder] of folders.entries()) {
    await mkdir(join(folder, 'assets'), { recursive: true });
    await writeFile(join(folder, 'assets', 'diagram one.svg'), `<svg xmlns="http://www.w3.org/2000/svg" ${index ? 'width="90" height="40"' : 'viewBox="0 0 160 100"'}><circle cx="20" cy="20" r="15" fill="green"/></svg>`);
  }
  await page.addInitScript(source => {
    Object.defineProperty(window, 'showDirectoryPicker', { value: undefined, configurable: true });
    localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: source, settings: {} }));
  }, source);
  await page.goto('/');
  await page.locator('[data-mobile-view="preview"]').click();
  await page.locator('.local-image-base > summary').click();
  const choose = async (folder: string) => {
    const picker = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /انتخاب پوشهٔ پایه|تغییر پوشه/ }).click();
    await (await picker).setFiles(folder);
  };
  await choose(folders[0]);
  const images = page.locator('.rich-markdown-image img');
  await expect(images).toHaveCount(2);
  await expect.poll(() => images.evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).naturalWidth))).toEqual([240, 240]);
  await expect(images.first()).toBeVisible();
  await expect(images.first()).toHaveAttribute('alt', 'نمودار محلی');
  await expect(page.locator('#markdown-source')).toHaveValue(source);
  await page.getByRole('button', { name: 'حذف پوشهٔ پایه' }).click();
  await expect(images).toHaveCount(0);
  await choose(folders[1]);
  await expect.poll(() => images.evaluateAll(nodes => nodes.map(node => (node as HTMLImageElement).naturalWidth))).toEqual([90, 90]);
  await expect(page.locator('#markdown-source')).toHaveValue(source);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('base subfolder handles parent paths within selected root and offers folder fallback after picker failure', async ({ page }, testInfo) => {
  const source = '![تصویر](../assets/diagram.svg)';
  const folder = testInfo.outputPath('project');
  await mkdir(join(folder, 'assets'), { recursive: true });
  await writeFile(join(folder, 'assets', 'diagram.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="75" height="40"><circle cx="20" cy="20" r="15"/></svg>');
  await page.addInitScript(source => {
    Object.defineProperty(window, 'showDirectoryPicker', { value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')), configurable: true });
    localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: source, settings: {} }));
  }, source);
  await page.goto('/');
  await page.locator('[data-mobile-view="preview"]').click();
  await page.locator('.local-image-base > summary').click();
  await page.getByRole('button', { name: 'انتخاب پوشهٔ پایه' }).click();
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'انتخاب پوشه با روش سازگار' }).click();
  await (await picker).setFiles(folder);
  await page.getByLabel('مسیر سند نسبت به پوشهٔ انتخاب‌شده').fill('docs');
  const image = page.locator('.rich-markdown-image img');
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(75);
  await page.getByLabel('مسیر سند نسبت به پوشهٔ انتخاب‌شده').fill('');
  await expect(image).toHaveCount(0);
  await expect(page.locator('#markdown-source')).toHaveValue(source);
});
