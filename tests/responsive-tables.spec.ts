import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, markdown: string) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(markdown => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { direction: 'auto' } })), markdown);
  await page.goto('/');
  if (page.viewportSize()!.width < 900) await page.locator('[data-mobile-view="preview"]').click();
  const rich = page.locator('.rich-document');
  await expect(rich.locator('table')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return { rich, errors };
}
const wide = '| ' + Array(12).fill('ستون').join(' | ') + ' |\n| ' + Array(12).fill('---').join(' | ') + ' |\n| ' + Array.from({ length: 12 }, (_, i) => `داده ${i + 1}`).join(' | ') + ' |';

for (const width of [320, 393, 1280]) {
  test(`wide tables scroll within their wrapper at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    const { rich, errors } = await open(page, wide);
    const wrapper = rich.locator('.tableWrapper');
    await expect(wrapper).toHaveAttribute('tabindex', '0');
    await expect.poll(() => wrapper.evaluate(el => el.scrollWidth > el.clientWidth + 20)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await rich.locator('th').first().evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(59);
    const original = await wrapper.evaluate(el => el.scrollLeft);
    await wrapper.evaluate(el => { el.scrollLeft = -200; if (!el.scrollLeft) el.scrollLeft = 200; });
    expect(await wrapper.evaluate(el => el.scrollLeft)).not.toBe(original);
    await expect(page.locator('textarea.markdown-editor')).toHaveValue(wide);
    expect(errors).toEqual([]);
  });
}

test('content widths keep numbers compact and long words inside readable cells', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { rich } = await open(page, `| # | توضیحات |\n| --- | --- |\n| 1 | ${'wordwithoutspaces'.repeat(90)} |`);
  const cells = rich.locator('td');
  const sizes = await cells.evaluateAll(els => els.map(el => ({ width: el.getBoundingClientRect().width, content: el.querySelector('p')!.getBoundingClientRect() })));
  expect(sizes[0].width * 2).toBeLessThan(sizes[1].width);
  expect(sizes[1].content.width).toBeLessThanOrEqual(384.5);
  expect(sizes[1].content.height).toBeGreaterThan(60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('formula natural width controls the column; oversized math gets a shadcn viewport and remeasures on resize', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 850 });
  const medium = String.raw`\displaystyle\sum_{k=0}^{n}\binom{n}{k}x^ky^{n-k}=(x+y)^n`;
  const giant = Array(24).fill(String.raw`\frac{x^2+\sqrt{2}}{3!}`).join('+');
  const { rich, errors } = await open(page, `| نوع | فرمول |\n| --- | --- |\n| کوتاه | $x^2$ |\n| متوسط | $${medium}$ |\n| بلند | $${giant}$ |`);
  const math = rich.locator('.math-scroll');
  await expect(math).toHaveCount(3);
  await expect(math.last()).toHaveAttribute('data-overflow', 'true');
  const viewport = math.last().locator('[data-slot="scroll-area-viewport"]');
  expect(await viewport.evaluate(el => el.scrollWidth / el.clientWidth)).toBeGreaterThan(3);
  expect(await math.last().evaluate(el => el.getBoundingClientRect().width)).toBeLessThan(393);
  await viewport.evaluate(el => { el.scrollLeft = 200; });
  expect(await viewport.evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const small = await math.last().evaluate(el => el.getBoundingClientRect().width);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(() => math.last().evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(small + 30);
  const natural = math.last().locator('.math-content');
  const oldWidth = await natural.evaluate(el => el.getBoundingClientRect().width);
  await rich.evaluate(el => { (el as HTMLElement).style.fontSize = '1.5rem'; });
  await expect.poll(() => natural.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(oldWidth * 1.3);
  await expect(math.last()).toHaveAttribute('data-overflow', 'true');
  expect(errors).toEqual([]);
});

test('large table images preserve aspect ratio and fit the pane', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 });
  const svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="320"><rect width="960" height="320" fill="blue"/></svg>');
  const { rich } = await open(page, `| تصویر | متن |\n| --- | --- |\n| ![large](${svg}) | شرح |`);
  const img = rich.getByRole('img', { name: 'large', exact: true });
  await expect(img).toBeVisible();
  const size = await img.boundingBox();
  expect(size!.width).toBeGreaterThan(100);
  expect(size!.width).toBeLessThan(320);
  expect(Math.abs(size!.width / size!.height - 3)).toBeLessThan(.02);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
