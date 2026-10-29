import { expect, test, type Page } from '@playwright/test';

const markdown = '# پیوندها\n\n[**لینک توپر**](https://example.test/path?q=%D9%85#part)\n\n[مرجع][guide]\n\n| پیوند |\n| --- |\n| [جدول](https://example.test/table) |\n\n[نسبی](./guide#part)\n\n[guide]: https://example.test/reference';
async function open(page: Page) {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.context().route('https://example.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Link destination</title>Opened' }));
  await page.addInitScript(markdown => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: {} })), markdown);
  await page.goto('/en');
  await expect(page.locator('.rich-document a')).toHaveCount(4);
}

for (const modifier of ['Control', 'Meta'] as const) test(`${modifier}+click on nested link text opens a new tab and preserves the draft`, async ({ page }) => {
  await open(page);
  const url = page.url();
  const opened = page.context().waitForEvent('page');
  await page.locator('.rich-document a strong').click({ modifiers: [modifier] });
  const destination = await opened;
  await expect(destination).toHaveURL('https://example.test/path?q=%D9%85#part');
  await expect(destination).toHaveTitle('Link destination');
  expect(await destination.evaluate(() => window.opener)).toBeNull();
  await expect(page).toHaveURL(url);
  await expect(page.locator('#markdown-source')).toHaveValue(markdown);
  await destination.close();
});

test('ordinary clicks still place the caret and edit link text without navigation', async ({ page }) => {
  await open(page);
  await page.locator('.rich-document a strong').click();
  await expect(page.locator('.rich-document')).toBeFocused();
  await page.locator('.rich-document').press('X');
  await expect(page.locator('#markdown-source')).toHaveValue(/X/);
  expect(page.context().pages()).toHaveLength(1);
});

test('reference and table links both follow Ctrl+click once', async ({ page }) => {
  await open(page);
  for (const [label, url] of [['مرجع', 'https://example.test/reference'], ['جدول', 'https://example.test/table']]) {
    const opened = page.context().waitForEvent('page');
    await page.locator('.rich-document').getByRole('link', { name: label, exact: true }).click({ modifiers: ['Control'] });
    const destination = await opened;
    await expect(destination).toHaveURL(url);
    expect(page.context().pages()).toHaveLength(2);
    await destination.close();
  }
  await expect(page.locator('#markdown-source')).toHaveValue(markdown);
});

test('relative browser links use the current page base in a separate tab', async ({ page }) => {
  await open(page);
  const expected = new URL('./guide#part', page.url()).href;
  await page.context().route('**/guide', route => route.fulfill({ contentType: 'text/html', body: '<title>Relative destination</title>' }));
  const opened = page.context().waitForEvent('page');
  await page.locator('.rich-document').getByRole('link', { name: 'نسبی', exact: true }).click({ modifiers: ['Control'] });
  const destination = await opened;
  await expect(destination).toHaveURL(expected);
  await expect(page.locator('#markdown-source')).toHaveValue(markdown);
  await destination.close();
});
