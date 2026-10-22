import { test, expect } from '@playwright/test';

const source = '# پیش‌نمایش زنده\n\nمتن فارسی با React (version **19**).\n\n```typescript\nconst version = 19; // React\nconsole.log("Hello (World)");\n```\n\nرابطهٔ $E=mc^2$ برقرار است.';

for (const [name, width, height] of [['desktop', 1100, 800], ['mobile', 393, 851], ['mobile-small', 320, 780]] as const) {
  test(`${name}: direction, editing and responsive preview`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(({ source }) => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: source, settings: { direction: 'auto' } })), { source });
    await page.goto('/');
    const editor = page.getByRole('textbox', { name: 'متن Markdown' });
    await expect(editor).toBeVisible();
    await expect(page.locator('.prose h1')).toHaveText('پیش‌نمایش زنده');
    const heading = (await page.locator('.intro h1').boundingBox())!;
    const direction = (await page.getByRole('combobox', { name: 'جهت متن', exact: true }).boundingBox())!;
    expect(direction.y).toBeGreaterThanOrEqual(heading.y + heading.height);
    const edit = (await page.locator('.editing-pane').boundingBox())!;
    if (width >= 900) {
      const preview = (await page.locator('.preview-pane').boundingBox())!;
      await expect(page.locator('.mobile-view-switch')).toBeHidden();
      expect(Math.abs(edit.y - preview.y)).toBeLessThan(2);
      expect(preview.x + preview.width).toBeLessThanOrEqual(edit.x + 2);
      expect(edit.width).toBeGreaterThan(450);
      expect(preview.width).toBeGreaterThan(450);
    } else {
      await expect(page.locator('.preview-pane')).toBeHidden();
      await expect(page.locator('[data-mobile-view="edit"]')).toHaveAttribute('aria-pressed', 'true');
      const switchBox = (await page.locator('.mobile-view-switch').boundingBox())!;
      expect(switchBox.y + switchBox.height).toBeLessThanOrEqual(edit.y + 2);
      for (const button of await page.locator('.mobile-view-switch button').all()) {
        expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
    }
    await expect(page.locator('.side-panel')).toHaveCount(0);
    await editor.fill(source.replace('پیش‌نمایش زنده', 'نتیجهٔ تایپ'));
    await expect(page.locator('.prose h1')).toHaveText('نتیجهٔ تایپ');
    await expect(editor).toBeFocused();
    await expect(page.locator('.katex')).toHaveCount(1);
    await expect(page.locator('.code-block [data-scope="keyword"]').first()).toHaveCSS('color', 'rgb(207, 34, 46)');
    await page.getByRole('combobox', { name: 'جهت متن', exact: true }).click();
    await page.getByRole('option', { name: 'چپ‌به‌راست', exact: true }).click();
    await expect(editor).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('.prose p').first()).toHaveAttribute('dir', 'ltr');
    await page.getByRole('combobox', { name: 'جهت متن', exact: true }).click();
    await page.getByRole('option', { name: 'جهت خودکار', exact: true }).click();
    await expect(page.locator('.prose p').first()).toHaveAttribute('dir', 'rtl');
    if (width < 900) {
      await page.locator('[data-mobile-view="preview"]').click();
      await expect(page.locator('.preview-pane')).toBeVisible();
      await expect(page.locator('.editing-pane')).toBeHidden();
      await expect(page.locator('.prose h1')).toBeVisible();
      await expect(page.getByRole('toolbar', { name: 'ابزار قالب‌بندی' })).toBeHidden();
      await expect(page.locator('[data-mobile-view="preview"]')).toHaveAttribute('aria-pressed', 'true');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${name}-live-preview.png`), fullPage: false });
  });
}

test('mobile switching preserves text and selection without opening the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.goto('/');
  const editor = page.getByRole('textbox', { name: 'متن Markdown' });
  await editor.fill(source);
  await editor.evaluate(element => (element as HTMLTextAreaElement).setSelectionRange(7, 16));
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.prose h1')).toHaveText('پیش‌نمایش زنده');
  await expect(editor).toBeHidden();
  await page.locator('[data-mobile-view="edit"]').click();
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue(source);
  expect(await editor.evaluate(element => { const textarea = element as HTMLTextAreaElement; return [textarea.selectionStart, textarea.selectionEnd]; })).toEqual([7, 16]);
  await expect(editor).not.toBeFocused();
  expect(await editor.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
});

test('the mobile choice survives a resize through the desktop breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 899, height: 851 });
  await page.goto('/');
  await page.getByRole('textbox', { name: 'متن Markdown' }).fill(source);
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.editing-pane')).toBeHidden();
  await page.setViewportSize({ width: 900, height: 851 });
  await expect(page.locator('.editing-pane')).toBeVisible();
  await expect(page.locator('.preview-pane')).toBeVisible();
  await expect(page.locator('.mobile-view-switch')).toBeHidden();
  await page.setViewportSize({ width: 393, height: 851 });
  await expect(page.locator('.preview-pane')).toBeVisible();
  await expect(page.locator('.editing-pane')).toBeHidden();
  await expect(page.locator('[data-mobile-view="preview"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-mobile-view="edit"]').click();
  await expect(page.getByRole('textbox', { name: 'متن Markdown' })).toHaveValue(source);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('start writing from an empty mobile preview returns to the editor and focuses it', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.goto('/');
  await page.getByRole('button', { name: 'یادداشت تازه', exact: true }).click();
  await page.locator('[data-mobile-view="preview"]').click();
  await page.getByRole('button', { name: 'شروع نوشتن' }).click();
  const editor = page.getByRole('textbox', { name: 'متن Markdown' });
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('');
  await expect(page.locator('.preview-pane')).toBeHidden();
});
