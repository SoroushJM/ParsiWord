import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { defaultAppearance } from '../packages/core/src/appearance';

const source = '# عنوان فارسی\n\n**متن پررنگ** و *مورب* و [پیوند](https://example.com).\n\n```ts\nconst message = "سلام"; // comment\n```\n';
const key = 'parsiword-appearance-v1';
async function open(page: Page, width = 1200) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(markdown => { localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { direction: 'auto' } })); }, source);
  await page.goto('/');
  await expect(page.locator('textarea.markdown-editor')).toHaveValue(source);
  await page.getByRole('button', { name: 'تم', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
const section = (page: Page, name: string) => page.getByRole('tab', { name, exact: true }).click();
const color = (page: Page, role: string) => page.locator(`[data-color-role="${role}"]`);
const palette = (page: Page, name: string) => page.getByRole('radiogroup', { name: 'ویرایش پالت', exact: true }).getByRole('radio', { name, exact: true }).click();
const save = (page: Page) => page.getByRole('dialog').getByRole('button', { name: 'ذخیره', exact: true }).click();

test('live colors accept runtime CSS formats, cancel restores state, and palettes persist independently', async ({ page }) => {
  await open(page);
  await page.getByRole('radio', { name: 'سرمه‌ای', exact: true }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(234, 240, 248)');
  await section(page, 'محیط و پس‌زمینه');
  await color(page, 'preview-background').fill('rgb(250 240 220 / 95%)');
  await color(page, 'source-background').fill('ivory');
  await expect(page.locator('.markdown-source-editor')).toHaveCSS('background-color', 'rgb(255, 255, 240)');
  await expect(page.locator('.preview-pane')).toHaveCSS('background-color', 'rgba(250, 240, 220, 0.95)');
  await section(page, 'سینتکس کد');
  await color(page, 'syntax-keyword').fill('oklch(50% .2 280)');
  await expect(color(page, 'syntax-keyword')).toHaveAttribute('aria-invalid', 'false');
  await color(page, 'syntax-string').fill('color-mix(in srgb, blue 40%, red)');
  await color(page, 'syntax-comment').fill('red; display:none');
  await expect(color(page, 'syntax-comment')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'ذخیره', exact: true })).toBeDisabled();
  await color(page, 'syntax-comment').fill('hsl(140 40% 30%)');
  await page.getByRole('button', { name: 'انصراف', exact: true }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(240, 245, 242)');
  expect(await page.evaluate(k => localStorage.getItem(k), key)).toBeNull();
  await page.getByRole('button', { name: 'تم', exact: true }).click();
  await section(page, 'Markdown');
  await color(page, 'source-syntax-heading').fill('rebeccapurple');
  await color(page, 'markdown-strong').fill('hsl(20 80% 40%)');
  const lightHeading = await color(page, 'source-syntax-heading').inputValue();
  await palette(page, 'پالت تیره');
  await expect(color(page, 'source-syntax-heading')).not.toHaveValue(lightHeading);
  await color(page, 'source-syntax-heading').fill('yellow');
  await save(page);
  await expect(page.locator('html')).toHaveAttribute('data-display-theme', 'light');
  await expect(page.locator('.markdown-source-highlight [data-md-token=heading]').first()).toHaveCSS('color', 'rgb(102, 51, 153)');
  await expect(page.locator('textarea.markdown-editor')).toHaveValue(source);
  await page.reload();
  await expect(page.locator('.markdown-source-highlight [data-md-token=heading]').first()).toHaveCSS('color', 'rgb(102, 51, 153)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('.markdown-source-highlight [data-md-token=heading]').first()).toHaveCSS('color', 'rgb(255, 255, 0)');
  await expect(page.locator('textarea.markdown-editor')).toHaveValue(source);
});

test('named themes round trip through JSON, merge safely and reject arbitrary CSS', async ({ page }) => {
  await open(page);
  await page.getByRole('radio', { name: 'کاغذی', exact: true }).click();
  await page.getByLabel('ذخیرهٔ یک نسخهٔ نام‌دار', { exact: true }).fill('My paper');
  await page.getByRole('button', { name: 'ساخت تم نام‌دار', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'خروجی تم‌ها', exact: true }).click();
  const exported = await download;
  const text = await readFile((await exported.path())!, 'utf8');
  expect(JSON.parse(text).themes[0].name).toBe('My paper');
  await page.getByLabel('فایل تم', { exact: true }).setInputFiles({ name: 'themes.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.getByRole('status').filter({ hasText: 'تم‌ها وارد شدند' })).toBeVisible();
  await save(page);
  const state = await page.evaluate(k => JSON.parse(localStorage.getItem(k)!), key);
  expect(state.themes).toHaveLength(2); expect(state.themes[0].id).not.toBe(state.themes[1].id);
  await page.getByRole('button', { name: 'تم', exact: true }).click();
  const invalid = { ...defaultAppearance(), selected: 'bad', themes: [{ id: 'bad', name: 'Bad', base: 'neutral', light: { background: 'url(https://example.test/a)' }, dark: {} }] };
  await page.getByLabel('فایل تم', { exact: true }).setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'parsiword-themes', ...invalid })) });
  await expect(page.getByRole('status').filter({ hasText: 'فایل تم معتبر نیست' })).toBeVisible();
  await page.getByRole('button', { name: 'انصراف', exact: true }).click();
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)!).themes.length, key)).toBe(2);
});

for (const width of [320, 393, 1200]) test(`theme panel fits ${width} and keeps independent source metrics`, async ({ page }) => {
  await open(page, width);
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
  expect(bounds!.height).toBe(900);
  await section(page, 'محیط و پس‌زمینه');
  await color(page, 'background').fill('color(display-p3 0.2 0.3 0.5)');
  await color(page, 'source-background').fill('transparent');
  await expect(color(page, 'background')).toHaveAttribute('aria-invalid', 'false');
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'انصراف', exact: true }).click();
  await expect(page.locator('textarea.markdown-editor')).toHaveValue(source);
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('.markdown-source-highlight')).toHaveCSS('visibility', 'hidden');
});

test('reset applies only to the palette being edited and English controls are translated', async ({ page }) => {
  await open(page);
  await section(page, 'سینتکس کد');
  await color(page, 'syntax-keyword').fill('red');
  await palette(page, 'پالت تیره');
  await color(page, 'syntax-keyword').fill('yellow');
  await page.getByRole('button', { name: 'بازگردانی پالت', exact: true }).click();
  await expect(color(page, 'syntax-keyword')).toHaveValue('#ffacb3');
  await palette(page, 'پالت روشن');
  await expect(color(page, 'syntax-keyword')).toHaveValue('red');
  await save(page);
  await page.getByRole('link', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Theme', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('tab', { name: 'Code syntax', exact: true })).toBeVisible();
});

test('Mermaid preview switches with display mode and retains distinct light export rendering', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.addInitScript(() => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: '```mermaid\ngraph LR\n A[Hello] --> B[World]\n```', settings: { direction: 'auto' } })));
  await page.goto('/');
  await expect(page.locator('.mermaid-canvas svg')).toBeVisible();
  const before = await page.locator('.mermaid-canvas').innerHTML();
  await page.getByRole('radiogroup', { name: 'ظاهر برنامه', exact: true }).getByRole('radio', { name: 'تیره', exact: true }).click();
  await expect(page.locator('.mermaid-diagram')).toHaveAttribute('data-diagram-theme', 'dark');
  await expect.poll(() => page.locator('.mermaid-canvas').innerHTML()).not.toBe(before);
  const result = await page.evaluate(async () => {
    const { renderMermaid } = await import(performance.getEntriesByType('resource').map(entry => entry.name).find(url => /\/diagrams\.ts(?:\?|$)/.test(url))!);
    const light = await renderMermaid('graph LR\n A[Hello] --> B[World]');
    const dark = await renderMermaid('graph LR\n A[Hello] --> B[World]', 'dark');
    return { same: light.svg === dark.svg, cached: light === await renderMermaid('graph LR\n A[Hello] --> B[World]') };
  });
  expect(result).toEqual({ same: false, cached: true });
});

test('color input on a long document preserves native metrics and existing preview nodes at 4x CPU', async ({ page }, info) => {
  const markdown = '# متن بلند\n\n' + Array.from({ length: 300 }, (_, n) => `بند ${n}: متن فارسی و **English** برای بررسی رنگ و جای مکان‌نما.\n\n`).join('');
  await page.setViewportSize({ width: 393, height: 851 });
  await page.addInitScript(markdown => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { direction: 'auto' } })), markdown);
  await page.goto('/');
  const textarea = page.locator('textarea.markdown-editor');
  await expect(textarea).toHaveValue(markdown);
  await page.evaluate(() => document.fonts.ready);
  const metrics = () => textarea.evaluate(el => { const style = getComputedStyle(el); return [el.scrollHeight, style.fontFamily, style.fontSize, style.lineHeight, style.letterSpacing]; });
  const before = await metrics();
  const paragraph = (await page.locator('.rich-document p').first().elementHandle())!;
  await page.getByRole('button', { name: 'تم', exact: true }).click();
  await section(page, 'محیط و پس‌زمینه');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const durations = [];
  try {
    for (let n = 0; n < 12; n++) {
      const start = performance.now();
      await color(page, 'source-background').fill(`rgb(${200 + n} 230 240)`);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      durations.push(Math.round(performance.now() - start));
    }
    await save(page);
    expect(await paragraph.evaluate(el => el.isConnected)).toBe(true);
    await expect(textarea).toHaveValue(markdown);
    expect(await metrics()).toEqual(before);
    const report = JSON.stringify({ characters: markdown.length, viewport: '393×851', cpu: 4, colorInputs: durations.length, updateAndPaintMs: durations, previewNodeRetained: true, nativeMetricsUnchanged: true }, null, 2);
    await writeFile(info.outputPath('theme-performance.json'), report);
    await info.attach('appearance-performance', { body: report, contentType: 'application/json' });
  } finally { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await cdp.detach(); }
});
