import { expect, test, type Page } from '@playwright/test';

const table = '| نام | مقدار |\n| --- | ---: |\n| نمونه | 12 |\n| دوم | 24 |';
const before = '# پیش از جدول\n\nمتن محفوظ &amp; با __قالب__\n\n';
const after = '\n\nپس از جدول $x^2$\n\n~~~js\nconst untouched = 42;\n~~~';

async function openTable(page: Page, markdown = before + table + after) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(markdown => { if (!localStorage.getItem('parsiword-draft-v1')) localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { direction: 'auto' } })); }, markdown);
  await page.goto('/');
  if ((page.viewportSize()?.width || 0) < 900) await page.locator('[data-mobile-view="preview"]').click();
  const rich = page.getByRole('textbox', { name: 'ویرایش پیش‌نمایش', exact: true });
  await expect(rich).toBeEditable();
  const cells = rich.locator('td');
  await (await cells.count() ? cells.first() : rich.locator('th').first()).click();
  return { rich, errors, source: page.locator('textarea.markdown-editor') };
}

for (const width of [393, 1280]) {
  test(`table column changes retain Markdown, history and a usable editor at width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const { rich, errors, source } = await openTable(page);
    await page.getByRole('button', { name: 'افزودن ستون', exact: true }).click();
    await expect(rich.locator('tr').first().locator('th')).toHaveCount(3);
    await expect(source).toHaveValue(/\| نمونه\s+\|\s+\|\s+12/);
    await expect(source).toHaveValue(/\| دوم\s+\|\s+\|\s+24/);
    expect((await source.inputValue()).startsWith(before)).toBe(true);
    expect((await source.inputValue()).endsWith(after)).toBe(true);
    await page.getByRole('button', { name: 'حذف ستون', exact: true }).click();
    await expect(rich.locator('tr').first().locator('th')).toHaveCount(2);
    await expect(source).not.toHaveValue(/نمونه/);
    await page.getByRole('button', { name: 'واگرد', exact: true }).click();
    await expect(rich.locator('tr').first().locator('th')).toHaveCount(3);
    await page.getByRole('button', { name: 'واگرد', exact: true }).click();
    await expect(source).toHaveValue(before + table + after);
    await page.getByRole('button', { name: 'انجام دوباره', exact: true }).click();
    await expect(source).toHaveValue(/\| دوم\s+\|\s+\|\s+24/);
    const changed = await source.inputValue();
    // A fresh mount must show the saved table, rather than hiding corruption
    // behind the rich editor's still-live ProseMirror document.
    await expect(page.locator('.editor-status')).toContainText('ذخیره شد');
    await page.reload();
    await expect(source).toHaveValue(changed);
    if (width < 900) await page.locator('[data-mobile-view="preview"]').click();
    await expect(rich.locator('table tr')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
}

test('repeated column changes never unmount the document', async ({ page }) => {
  const { rich, errors } = await openTable(page);
  for (let index = 0; index < 4; index++) {
    await page.getByRole('button', { name: 'افزودن ستون', exact: true }).click();
    await page.getByRole('button', { name: 'حذف ستون', exact: true }).click();
  }
  expect(errors).toEqual([]);
  await expect(rich).toBeEditable();
  await expect(rich.locator('table tr')).toHaveCount(3);
});

test('the last column is protected and explicit table deletion can be undone', async ({ page }) => {
  const single = '| عنوان |\n| --- |\n| داده |';
  const { rich, source, errors } = await openTable(page, before + single + after);
  await page.getByRole('button', { name: 'حذف ستون', exact: true }).click();
  await expect(source).toHaveValue(before + single + after);
  await page.getByRole('button', { name: 'حذف جدول', exact: true }).click();
  await expect(rich.locator('table')).toHaveCount(0);
  await expect(source).toHaveValue(/پس از جدول/);
  expect((await source.inputValue()).startsWith(before.trimEnd())).toBe(true);
  expect((await source.inputValue()).endsWith(after)).toBe(true);
  await page.getByRole('button', { name: 'واگرد', exact: true }).click();
  await expect(source).toHaveValue(before + single + after);
  await expect(rich.locator('table tr')).toHaveCount(2);
  expect(errors).toEqual([]);
});

for (const [name, markdown] of [
  ['header only', '| نام | مقدار |\n| --- | --- |'],
  ['empty cells', '| | |\n| --- | --- |\n| | |'],
  ['short row', '| نام | مقدار |\n| --- | --- |\n| یک |\n| دو | 2 |'],
  ['escaped pipe and formula', '| نام | مقدار |\n| --- | --- |\n| الف\\|ب | $x^2$ |'],
] as const) {
  test(`column edits remain consistent for a table with ${name}`, async ({ page }) => {
    const { rich, source, errors } = await openTable(page, before + markdown + after);
    await page.getByRole('button', { name: 'افزودن ستون', exact: true }).click();
    await expect(rich.locator('tr').first().locator('th')).toHaveCount(3);
    await rich.locator('tr').first().locator('th').nth(1).click();
    await page.getByRole('button', { name: 'حذف ستون', exact: true }).click();
    await expect(rich.locator('tr').first().locator('th')).toHaveCount(2);
    const rows = await rich.locator('table tr').count();
    expect((await source.inputValue()).startsWith(before)).toBe(true);
    expect((await source.inputValue()).endsWith(after)).toBe(true);
    await expect(page.locator('.editor-status')).toContainText('ذخیره شد');
    await page.reload();
    await page.locator('[data-mobile-view="preview"]').click();
    await expect(rich.locator('table tr')).toHaveCount(rows);
    await expect(rich.locator('tr').first().locator('th')).toHaveCount(2);
    expect(errors).toEqual([]);
  });
}

test('changing columns in a long document keeps its reading position', async ({ page }) => {
  const prefix = Array.from({ length: 25 }, (_, index) => `## بخش ${index + 1}\n\nمتن پیش از جدول برای بررسی موقعیت مطالعه.\n\n`).join('');
  const { rich, errors } = await openTable(page, prefix + table + after);
  const position = () => rich.evaluate(element => ({ y: scrollY, tableY: element.querySelector('table')!.getBoundingClientRect().top }));
  await expect(page.getByRole('button', { name: 'افزودن ستون', exact: true })).toBeVisible();
  const initial = await position();
  expect(initial.y).toBeGreaterThan(1000);
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: 'افزودن ستون', exact: true }).click();
    await page.getByRole('button', { name: 'حذف ستون', exact: true }).click();
    const current = await position();
    expect(Math.abs(current.y - initial.y)).toBeLessThan(200);
    expect(Math.abs(current.tableY - initial.tableY)).toBeLessThan(200);
  }
  expect(errors).toEqual([]);
});
