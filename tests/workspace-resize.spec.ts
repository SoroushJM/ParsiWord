import { expect, test, type Page } from '@playwright/test';

test.use({ isMobile: false, hasTouch: false });

const source = '# سند آزمایشی\n\n' + Array.from({ length: 24 }, (_, index) =>
  `## Section ${index}\n\n${'متن فارسی با English و **قالب‌بندی** برای بررسی شکست سطر و حفظ سند. '.repeat(6)}\n`,
).join('\n');

async function openDocument(page: Page, path = '/', width = 1920) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(markdown => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { direction: 'auto' } })), source);
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.rich-document h2')).toHaveCount(24);
  await expect(page.locator('.workspace-resize-handle')).toBeVisible();
}

async function dragDivider(page: Page, delta: number) {
  const box = (await page.locator('.workspace-resize-handle').boundingBox())!;
  // The divider spans the whole document; use its visible heading area.
  const y = Math.max(20, box.y + 20);
  await page.mouse.move(box.x + box.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, y, { steps: 12 });
  await page.mouse.up();
}

for (const [locale, path] of [['fa', '/'], ['en', '/en/']] as const) {
  test(`${locale}: full-width workspace resizes in both physical directions without changing Markdown`, async ({ page }) => {
    await openDocument(page, path);
    const workspace = (await page.locator('.document-panel').boundingBox())!;
    expect(workspace.width).toBeGreaterThan(1800);
    expect(Math.abs(workspace.x - (1920 - workspace.x - workspace.width))).toBeLessThan(2);
    const editor = page.locator('textarea.markdown-editor');
    await editor.evaluate(element => (element as HTMLTextAreaElement).setSelectionRange(10, 25));
    const divider = page.locator('.workspace-resize-handle');
    const initial = (await divider.boundingBox())!.x;
    await dragDivider(page, 180);
    await expect.poll(async () => (await divider.boundingBox())!.x - initial).toBeGreaterThan(160);
    await dragDivider(page, -360);
    await expect.poll(async () => (await divider.boundingBox())!.x - initial).toBeLessThan(-160);
    await expect(editor).toHaveValue(source);
    expect(await editor.evaluate(element => {
      const input = element as HTMLTextAreaElement;
      return [input.selectionStart, input.selectionEnd];
    })).toEqual([10, 25]);
    await expect.poll(() => editor.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await dragDivider(page, -1920);
    for (const pane of ['.editing-pane', '.preview-pane']) {
      expect((await page.locator(pane).boundingBox())!.width).toBeGreaterThanOrEqual(319);
    }
    await dragDivider(page, 1920);
    for (const pane of ['.editing-pane', '.preview-pane']) {
      expect((await page.locator(pane).boundingBox())!.width).toBeGreaterThanOrEqual(319);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('divider supports the keyboard and both panes keep their sticky tools after resizing', async ({ page }) => {
  await openDocument(page);
  const divider = page.getByRole('separator', { name: 'تغییر عرض ویرایشگر و پیش‌نمایش' });
  await divider.focus();
  const initial = (await divider.boundingBox())!.x;
  await divider.press('ArrowRight');
  await expect.poll(async () => (await divider.boundingBox())!.x).toBeGreaterThan(initial);
  await divider.press('ArrowLeft');
  await expect.poll(async () => Math.abs((await divider.boundingBox())!.x - initial)).toBeLessThan(2);
  await dragDivider(page, 200);
  await page.evaluate(() => window.scrollTo(0, 1400));
  await expect.poll(() => page.locator('.preview-pane').evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThanOrEqual(2);
  await expect.poll(() => page.locator('.editing-pane > .pane-heading').evaluate(element => Math.abs(element.getBoundingClientRect().top))).toBeLessThanOrEqual(2);
  await expect(page.locator('.format-toolbar')).toBeInViewport();
  await expect(page.locator('.rich-toolbar-container')).toBeInViewport();
});

test('mobile switching and desktop resizing preserve the same editor instances and selection', async ({ page }) => {
  await openDocument(page, '/', 1100);
  await dragDivider(page, 50);
  const editor = page.locator('textarea.markdown-editor');
  await editor.evaluate(element => {
    (element as HTMLTextAreaElement).setSelectionRange(7, 16);
    element.setAttribute('data-instance-check', 'original');
  });
  await page.setViewportSize({ width: 899, height: 851 });
  await expect(page.locator('.workspace-resize-handle')).toBeHidden();
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.editing-pane')).toBeHidden();
  await expect(page.locator('.preview-pane')).toBeVisible();
  await page.setViewportSize({ width: 900, height: 851 });
  await expect(page.locator('.workspace-resize-handle')).toBeVisible();
  await expect(page.locator('.editing-pane')).toBeVisible();
  await expect(page.locator('.preview-pane')).toBeVisible();
  await page.setViewportSize({ width: 320, height: 780 });
  await expect(page.locator('.workspace-resize-handle')).toBeHidden();
  await expect(page.locator('.editing-pane')).toBeHidden();
  await page.locator('[data-mobile-view="edit"]').click();
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute('data-instance-check', 'original');
  await expect(editor).toHaveValue(source);
  expect(await editor.evaluate(element => {
    const input = element as HTMLTextAreaElement;
    return [input.selectionStart, input.selectionEnd];
  })).toEqual([7, 16]);
  await expect(editor).not.toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
