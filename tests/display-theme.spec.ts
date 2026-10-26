import { expect, test, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

const source = '# عنوان فارسی\n\nمتن با  دو فاصله و **English**.\nنرم‌خط فارسی\n\nفرمول $E=mc^2$.\n\n```typescript\nconst message = "سلام"; // comment\n```\n';
const themeKey = 'parsiword-display-theme-v1';

async function openDocument(page: Page, width = 1100, preference?: string) {
  await page.setViewportSize({ width, height: 851 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(({ markdown, preference, themeKey }) => {
    localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { direction: 'auto' } }));
    if (preference) localStorage.setItem(themeKey, preference);
  }, { markdown: source, preference, themeKey });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'متن Markdown', exact: true })).toHaveValue(source);
  await page.evaluate(() => document.fonts.ready);
}

async function chooseTheme(page: Page, name: 'تیره' | 'روشن' | 'همگام با سیستم') {
  const choice = page.getByRole('radiogroup', { name: 'ظاهر برنامه', exact: true }).getByRole('radio', { name, exact: true });
  await choice.click();
  await expect(choice).toHaveAttribute('aria-checked', 'true');
}

test('persistent web preference follows system changes and preserves logical Markdown', async ({ page }) => {
  await openDocument(page);
  await expect(page.locator('html')).toHaveAttribute('data-display-theme', 'light');
  const editor = page.locator('textarea.markdown-editor');
  const metrics = await editor.evaluate(element => {
    const style = getComputedStyle(element);
    return [style.fontFamily, style.fontSize, style.lineHeight, style.letterSpacing];
  });
  const lightCode = await page.locator('.rich-document [data-scope="keyword"]').first().evaluate(element => getComputedStyle(element).color);
  const mathColor = () => page.locator('.rich-document .katex').first().evaluate(element => getComputedStyle(element).color);
  const documentColor = () => page.locator('.rich-document p').first().evaluate(element => getComputedStyle(element).color);
  expect(await mathColor()).toBe(await documentColor());
  await chooseTheme(page, 'تیره');
  await expect(page.locator('html')).toHaveAttribute('data-display-theme', 'dark');
  await expect(page.locator('.markdown-source-editor')).toHaveCSS('background-color', 'rgb(23, 36, 31)');
  await expect(page.locator('.preview-pane')).toHaveCSS('background-color', 'rgb(23, 36, 31)');
  expect(await mathColor()).toBe(await documentColor());
  await page.locator('input[type="file"]').setInputFiles({ name: 'oversize.md', mimeType: 'text/markdown', buffer: Buffer.alloc(500_001, 'a') });
  await expect(page.locator('[data-sonner-toaster]')).toHaveAttribute('data-sonner-theme', 'dark');
  await expect(page.locator('[data-sonner-toast]')).toHaveCSS('background-color', 'rgb(29, 45, 37)');
  expect(await page.locator('.rich-document [data-scope="keyword"]').first().evaluate(element => getComputedStyle(element).color)).not.toBe(lightCode);
  await expect(editor).toHaveValue(source);
  expect(await editor.evaluate(element => {
    const style = getComputedStyle(element);
    return [style.fontFamily, style.fontSize, style.lineHeight, style.letterSpacing];
  })).toEqual(metrics);
  expect(await page.evaluate(key => localStorage.getItem(key), themeKey)).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-display-theme', 'dark');
  await chooseTheme(page, 'همگام با سیستم');
  await expect(page.locator('html')).toHaveAttribute('data-display-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-display-theme', 'dark');
  await chooseTheme(page, 'روشن');
  await expect(page.locator('html')).toHaveAttribute('data-display-theme', 'light');
  await page.getByRole('link', { name: 'English', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  const englishThemes = page.getByRole('radiogroup', { name: 'Appearance', exact: true });
  await expect(englishThemes.getByRole('radio')).toHaveCount(3);
  const lightChoice = englishThemes.getByRole('radio', { name: 'Light', exact: true });
  await lightChoice.focus();
  await lightChoice.press('Space');
  await expect(lightChoice).toHaveAttribute('aria-checked', 'true');
  await lightChoice.press('ArrowRight');
  const darkChoice = englishThemes.getByRole('radio', { name: 'Dark', exact: true });
  await expect(darkChoice).toBeFocused();
  await darkChoice.press('Space');
  await expect(darkChoice).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-display-theme', 'dark');
  await expect(editor).toHaveValue(source);
  await expect(editor).toHaveAttribute('dir', 'auto');
});

test('display choice works when storage writes are unavailable', async ({ page }) => {
  await openDocument(page);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Blocked', 'SecurityError'); }; });
  await chooseTheme(page, 'تیره');
  await expect(page.locator('html')).toHaveAttribute('data-display-theme', 'dark');
  await expect(page.getByRole('textbox', { name: 'متن Markdown', exact: true })).toHaveValue(source);
});

test('Word document colors and text are independent of display theme', async ({ page }) => {
  await openDocument(page);
  async function wordXml() {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).click();
    const download = await pending;
    const archive = await JSZip.loadAsync(await readFile((await download.path())!));
    return archive.file('word/document.xml')!.async('string');
  }
  const light = await wordXml();
  await chooseTheme(page, 'تیره');
  const dark = await wordXml();
  expect(dark).toBe(light);
  expect(dark).toContain('CF222E');
});

for (const width of [320, 393, 1100]) {
  test(`${width}px theme controls preserve layout, source fallback and target size`, async ({ page }) => {
    await openDocument(page, width, 'dark');
    const expectedSize = width < 900 ? 44 : 32;
    const themeChoices = page.getByRole('radiogroup', { name: 'ظاهر برنامه', exact: true }).getByRole('radio');
    await expect(themeChoices).toHaveCount(3);
    for (const locator of [...await themeChoices.all(), page.getByRole('button', { name: 'باز کردن فایل', exact: true }), page.getByRole('button', { name: 'درج متن پررنگ', exact: true })]) {
      const bounds = await locator.boundingBox();
      expect(bounds?.width).toBeGreaterThanOrEqual(expectedSize);
      expect(bounds?.height).toBeGreaterThanOrEqual(expectedSize);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const sourceEditor = page.getByRole('textbox', { name: 'متن Markdown', exact: true });
    await expect(sourceEditor).toHaveCSS('unicode-bidi', 'plaintext');
    await page.emulateMedia({ forcedColors: 'active' });
    await expect(page.locator('.markdown-source-highlight')).toHaveCSS('visibility', 'hidden');
    const color = await sourceEditor.evaluate(element => getComputedStyle(element).color);
    expect(color).not.toBe('rgba(0, 0, 0, 0)');
    await expect(sourceEditor).toHaveValue(source);
    await page.emulateMedia({ forcedColors: 'none' });
    if (width < 900) await page.getByRole('radio', { name: 'پیش‌نمایش', exact: true }).click();
    const richButton = page.getByRole('button', { name: 'پررنگ', exact: true });
    const bounds = await richButton.boundingBox();
    expect(bounds?.width).toBeGreaterThanOrEqual(expectedSize);
    expect(bounds?.height).toBeGreaterThanOrEqual(expectedSize);
    await expect(page.locator('.rich-document p').first()).toHaveCSS('unicode-bidi', 'normal');
    await richButton.focus();
    expect(await richButton.evaluate(element => document.activeElement === element)).toBe(true);
  });
}
