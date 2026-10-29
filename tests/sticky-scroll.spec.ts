import { expect, test, type Page } from '@playwright/test';

const markdown = '# Sticky reading\n\n' + Array.from({ length: 30 }, (_, index) =>
  `## Section ${index}\n\n${'متن فارسی با English برای خواندن و اسکرول عادی. '.repeat(8)}\n\n`,
).join('');

async function open(page: Page, text = markdown, width = 1100) {
  await page.setViewportSize({ width, height: 851 });
  await page.addInitScript(text => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: text, settings: {} })), text);
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('textarea.markdown-editor')).toHaveValue(text);
  await expect.poll(() => page.locator('textarea.markdown-editor').evaluate(e => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(1);
}

test.describe('desktop sticky scroll routing', () => {
  test.use({ isMobile: false, hasTouch: false });

  test('scrolling over an unstuck preview moves the page naturally, then syncs when pinned', async ({ page }) => {
    await open(page);
    const panel = page.locator('.preview-panel');
    const pane = page.locator('.preview-pane');
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThan(130);
    await page.mouse.move(box.x + box.width / 2, Math.min(800, box.y + 160));
    await page.mouse.wheel(0, 130);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
    expect(await page.evaluate(() => scrollY)).toBeLessThanOrEqual(132);
    await expect.poll(() => panel.evaluate(e => e.scrollTop)).toBe(0);

    // Continue over the same pane through the sticky threshold.
    await page.mouse.wheel(0, 600);
    await expect.poll(() => pane.evaluate(e => Math.abs(e.getBoundingClientRect().top))).toBeLessThanOrEqual(1);
    const before = await panel.evaluate(e => e.scrollTop);
    await page.mouse.move(box.x + box.width / 2, 400);
    await page.mouse.wheel(0, 160);
    await expect.poll(() => panel.evaluate(e => e.scrollTop)).toBeGreaterThan(before + 100);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(730);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await expect.poll(() => panel.evaluate(e => e.scrollTop)).toBe(0);
    await page.mouse.move(box.x + box.width / 2, Math.min(800, box.y + 160));
    await page.mouse.wheel(0, 130);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(130);
    await expect(page.locator('textarea.markdown-editor')).toHaveValue(markdown);
  });

  test('a short source still allows its overflowing preview to scroll at the page bottom', async ({ page }) => {
    const text = '$$\n\\begin{matrix}' + Array.from({ length: 45 }, () => 'a & b').join(' \\\\ ') + '\\end{matrix}\n$$';
    await open(page, text);
    await expect(page.locator('.katex')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight - scrollY)).toBeLessThanOrEqual(1);
    const panel = page.locator('.preview-panel');
    const box = (await panel.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, Math.min(700, Math.max(250, box.y + 220)));
    await page.mouse.wheel(0, 180);
    await expect.poll(() => panel.evaluate(e => e.scrollTop)).toBeGreaterThan(100);
    await expect(page.locator('textarea.markdown-editor')).toHaveValue(text);
  });
});

for (const width of [320, 393]) test(`mobile ${width} keeps natural scrolling and both sticky tools`, async ({ page }) => {
  await open(page, markdown, width);
  for (const view of ['edit', 'preview']) {
    await page.locator(`[data-mobile-view="${view}"]`).click();
    await page.evaluate(() => window.scrollTo(0, 1100));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(1100);
    const box = (await page.locator(view === 'edit' ? '.editing-pane' : '.preview-pane').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, 500);
    await page.mouse.wheel(0, 130);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(1230);
    await expect.poll(() => page.locator('.mobile-view-switch').evaluate(e => Math.abs(e.getBoundingClientRect().top))).toBeLessThanOrEqual(1);
    const toolbar = page.locator(view === 'edit' ? '.format-toolbar' : '.rich-editor-toolbar');
    await expect.poll(() => toolbar.evaluate(e => e.getBoundingClientRect().top)).toBe(60);
  }
});
