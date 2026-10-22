import { test, expect } from '@playwright/test';

const source = '# پیش‌نمایش زنده\n\nمتن فارسی با React (version **19**).\n\n```typescript\nconst version = 19; // React\nconsole.log("Hello (World)");\n```\n\nرابطهٔ $E=mc^2$ برقرار است.';

for (const [name, width, height] of [['desktop', 1100, 800], ['mobile', 393, 851], ['mobile-small', 320, 780]] as const) {
  test(`${name}: direction under the title and live preview beside/above the editor`, async ({ page }, testInfo) => {
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
    const preview = (await page.locator('.preview-pane').boundingBox())!;
    if (width >= 900) {
      expect(Math.abs(edit.y - preview.y)).toBeLessThan(2);
      expect(preview.x + preview.width).toBeLessThanOrEqual(edit.x + 2);
      expect(edit.width).toBeGreaterThan(450);
      expect(preview.width).toBeGreaterThan(450);
    } else expect(preview.y + preview.height).toBeLessThanOrEqual(edit.y + 2);
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`${name}-live-preview.png`), fullPage: false });
  });
}
