import { expect, test, type Page } from '@playwright/test';

const original = '# سند اصلی\r\n\r\n__متن__ &amp; یک \\* ستاره\r\n';
async function setup(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => { if (!localStorage.getItem('parsiword-draft-v1')) localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: '# سند اصلی\r\n\r\n__متن__ &amp; یک \\* ستاره\r\n', settings: {} })); });
  await page.goto('/');
  return page.locator('textarea.markdown-editor');
}
async function library(page: Page) {
  await page.getByRole('button', { name: 'متن‌های نمونه', exact: true }).click();
  return page.getByRole('dialog');
}
async function choose(page: Page, name: string) {
  const dialog = await library(page);
  await dialog.getByLabel('جست‌وجوی نمونه‌ها').fill(name);
  await dialog.getByRole('button', { name, exact: false }).first().click();
  await expect(dialog).not.toBeVisible();
}

test('successive sample loads are separate source-exact Undo/Redo steps, including pending source edits', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const source = await setup(page);
  await choose(page, 'جدول عریض ۱۲ ستونی');
  await expect(source).toHaveValue(/# جدول عریض روی گوشی/);
  const first = await source.inputValue();
  await choose(page, 'عرض ستون بر اساس محتوا');
  const second = await source.inputValue();
  await source.focus();
  await source.press('Control+z');
  await expect(source).toHaveValue(first);
  await source.press('Control+z');
  // Textarea normalizes CRLF; persistence must retain the exact original.
  await expect(source).toHaveValue(original.replace(/\r\n/g, '\n'));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('parsiword-draft-v1')!).markdown)).toBe(original);
  await source.press('Control+Shift+z');
  await expect(source).toHaveValue(first);
  await source.press('Control+y');
  await expect(source).toHaveValue(second);
  await source.fill('# ویرایش منبع');
  await choose(page, 'فرمول‌های پیشرفته');
  await source.focus();
  await source.press('Control+z');
  await expect(source).toHaveValue('# ویرایش منبع');
  await source.press('Control+z');
  await expect(source).toHaveValue(second);
  expect(errors).toEqual([]);
});

test('personal sample persists on reload, loads current text and can be deleted', async ({ page }) => {
  const source = await setup(page);
  let dialog = await library(page);
  await dialog.getByLabel('نام نمونهٔ شخصی').fill('آزمون شخصی من');
  await dialog.getByRole('button', { name: 'ذخیرهٔ متن فعلی', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'آزمون شخصی من', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await source.fill('# متن دیگر');
  await choose(page, 'آزمون شخصی من');
  await expect(source).toHaveValue(original.replace(/\r\n/g, '\n'));
  dialog = await library(page);
  await dialog.getByRole('button', { name: 'حذف نمونه آزمون شخصی من', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'آزمون شخصی من', exact: true })).toHaveCount(0);
  await page.reload();
  dialog = await library(page);
  await expect(dialog).toContainText('هنوز نمونهٔ شخصی ذخیره نکرده‌ای.');
});

test('sample library fits a narrow production-style viewport and allows keyboard search', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 320, height: 640 });
  const dialog = await library(page);
  const bounds = await dialog.boundingBox();
  expect(bounds!.width).toBeLessThanOrEqual(290);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(640);
  await dialog.getByLabel('جست‌وجوی نمونه‌ها').fill('TikZ');
  await expect(dialog.getByRole('button', { name: 'هندسه با TikZ — Geometry' })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('closing the library restores focus; loading a sample focuses its start and allows immediate Undo', async ({ page }) => {
  const source = await setup(page);
  await library(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'متن‌های نمونه', exact: true })).toBeFocused();
  await choose(page, 'جدول عریض ۱۲ ستونی');
  await expect(page.locator('.rich-document')).toBeFocused();
  await page.keyboard.press('Control+z');
  await expect(source).toHaveValue(original.replace(/\r\n/g, '\n'));
});

test('loading and undoing a sample preserves source spelling even when rendered content is identical', async ({ page }) => {
  const source = await setup(page);
  const dialog = await library(page);
  await dialog.getByLabel('نام نمونهٔ شخصی').fill('همان ظاهر، منبع متفاوت');
  await dialog.getByRole('button', { name: 'ذخیرهٔ متن فعلی', exact: true }).click();
  await page.keyboard.press('Escape');
  const equivalent = '# سند اصلی\n\n**متن** & یک \\* ستاره\n';
  await source.fill(equivalent);
  await choose(page, 'همان ظاهر، منبع متفاوت');
  await expect(source).toHaveValue(original.replace(/\r\n/g, '\n'));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('parsiword-draft-v1')!).markdown)).toBe(original);
  await page.keyboard.press('Control+z');
  await expect(source).toHaveValue(equivalent);
  await page.keyboard.press('Control+Shift+z');
  await expect(source).toHaveValue(original.replace(/\r\n/g, '\n'));
});
