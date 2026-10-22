import { test, expect, type Page } from '@playwright/test';

async function openDocument(page: Page, markdown: string, fontSize = 12) {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.addInitScript(({ markdown, fontSize }) => localStorage.setItem('parsiword-draft-v1', JSON.stringify({
    markdown, settings: { fontSize },
  })), { markdown, fontSize });
  await page.goto('/');
  await expect(page.locator('.mermaid-diagram svg').first()).toBeVisible({ timeout: 30_000 });
}

async function diagramSize(page: Page, index = 0) {
  return page.locator('.mermaid-diagram svg').nth(index).evaluate(element => {
    const svg = element as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const frame = svg.closest('.mermaid-diagram')!;
    return {
      width: rect.width, height: rect.height,
      naturalWidth: svg.viewBox.baseVal.width, naturalHeight: svg.viewBox.baseVal.height,
      frameWidth: frame.clientWidth, contentWidth: frame.scrollWidth,
      textSize: Number.parseFloat(getComputedStyle(svg.closest('.prose')!).fontSize),
    };
  });
}

test('small diagrams stay compact and follow the document text size', async ({ page }) => {
  await openDocument(page, 'متن هم‌اندازهٔ نمودار.\n\n```mermaid\nflowchart TD\n A[Start] --> B[End]\n```', 10);
  const small = await diagramSize(page);
  expect(small.width).toBeLessThan(small.frameWidth * 0.7);
  expect(small.width / small.naturalWidth).toBeCloseTo(small.textSize / 16, 2);
  await expect(page.locator('.mermaid-scroll-hint')).toHaveCount(0);

  await page.getByRole('button', { name: 'تنظیمات خروجی' }).click();
  await page.getByRole('radiogroup', { name: 'اندازهٔ متن', exact: true }).getByRole('radio', { name: '۱۸ pt', exact: true }).click();
  await page.getByRole('button', { name: 'آماده است' }).click();
  const large = await diagramSize(page);
  expect(large.width).toBeGreaterThan(small.width * 1.5);
  expect(large.width / small.width).toBeCloseTo(large.textSize / small.textSize, 2);
  expect(large.width / large.height).toBeCloseTo(small.width / small.height, 2);
});

test('wide diagrams preserve readable labels and scroll inside their frame', async ({ page }) => {
  await openDocument(page, '```mermaid\nflowchart LR\n A[First stage] --> B[Second stage] --> C[Third stage] --> D[Fourth stage] --> E[Last stage]\n```');
  const size = await diagramSize(page);
  expect(size.contentWidth).toBeGreaterThan(size.frameWidth);
  expect(size.width / size.naturalWidth).toBeGreaterThanOrEqual(0.74);
  expect(size.width / size.height).toBeCloseTo(size.naturalWidth / size.naturalHeight, 2);
  await expect(page.locator('.mermaid-scroll-hint')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.setViewportSize({ width: 393, height: 851 });
  await page.locator('[data-mobile-view="preview"]').click();
  const mobile = await diagramSize(page);
  expect(mobile.frameWidth).toBeLessThan(393);
  expect(mobile.contentWidth).toBeGreaterThan(mobile.frameWidth);
  expect(mobile.width / mobile.naturalWidth).toBeGreaterThanOrEqual(0.74);
  await expect(page.locator('.mermaid-scroll-hint')).toBeVisible();
  await expect(page.locator('.mermaid-diagram')).toHaveAttribute('tabindex', '0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const [name, diagram, configured] of [
  ['init font sizes', 'flowchart TD\n A[Start] --> B[End]', '%%{init: {"fontSize":200,"themeVariables":{"fontSize":"200px"},"themeCSS":"text { font-size: 200px; }"}}%%\nflowchart TD\n A[Start] --> B[End]'],
  ['frontmatter font sizes', 'sequenceDiagram\n participant A as Writer\n participant B as ParsiWord\n A->>B: Markdown', '---\nconfig:\n  fontSize: 200\n  sequence:\n    actorFontSize: 200\n    messageFontSize: 200\n  themeVariables:\n    fontSize: 200px\n---\nsequenceDiagram\n participant A as Writer\n participant B as ParsiWord\n A->>B: Markdown'],
] as const) {
  test(`${name} do not inflate a diagram relative to document text`, async ({ page }) => {
    await openDocument(page, `\`\`\`mermaid\n${diagram}\n\`\`\`\n\n\`\`\`mermaid\n${configured}\n\`\`\``);
    await expect(page.locator('.mermaid-diagram svg')).toHaveCount(2, { timeout: 30_000 });
    const original = await diagramSize(page);
    const withOptions = await diagramSize(page, 1);
    expect(withOptions.naturalWidth).toBeCloseTo(original.naturalWidth, 0);
    expect(withOptions.naturalHeight).toBeCloseTo(original.naturalHeight, 0);
    expect(withOptions.width).toBeCloseTo(original.width, 0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
