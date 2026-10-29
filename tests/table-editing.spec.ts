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
    if (name === 'short row') {
      await expect(page.getByRole('button', { name: 'افزودن ستون', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: 'کامل‌کردن ستون‌های جدول', exact: true }).click();
    }
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

const irregular = '| نام | سن |\n| :--- | ---: |\n| علی | ۲۰ | تهران |\n| سارا |\n| رضا | ۴۰ | شیراز | مهندس |';
const repairLabel = 'کامل‌کردن ستون‌های جدول';

async function rowValues(rich: ReturnType<Page['getByRole']>) {
  return rich.locator('table tr').evaluateAll(rows => rows.map(row => Array.from(row.querySelectorAll('th, td'), cell => (cell.textContent || '').trim())));
}

for (const width of [393, 1280]) {
  test(`ragged table keeps all cells and repairs explicitly with history at width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const original = before + irregular + after;
    const { rich, source, errors } = await openTable(page, original);
    const addColumn = page.getByRole('button', { name: 'افزودن ستون', exact: true });
    const deleteColumn = page.getByRole('button', { name: 'حذف ستون', exact: true });
    const repair = page.getByRole('button', { name: repairLabel, exact: true });
    await expect(source).toHaveValue(original);
    expect((await rowValues(rich)).map(row => row.length)).toEqual([2, 3, 1, 4]);
    await expect(addColumn).toBeDisabled(); await expect(deleteColumn).toBeDisabled();
    await expect(page.getByRole('button', { name: 'افزودن ردیف', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'حذف ردیف', exact: true })).toBeEnabled();
    await expect(repair).toBeVisible();
    await page.screenshot({ path: `artifacts/table-irregular-${width}.png` });
    await repair.click();
    expect(await rowValues(rich)).toEqual([
      ['نام', 'سن', '', ''], ['علی', '۲۰', 'تهران', ''], ['سارا', '', '', ''], ['رضا', '۴۰', 'شیراز', 'مهندس'],
    ]);
    await expect(repair).toHaveCount(0);
    await expect(addColumn).toBeEnabled(); await expect(deleteColumn).toBeEnabled();
    await expect(source).not.toHaveValue(original);
    const repaired = await source.inputValue();
    expect(repaired.startsWith(before)).toBe(true); expect(repaired.endsWith(after)).toBe(true);
    expect(repaired).toMatch(/\|\s*:-+\s*\|\s*-+:\s*\|/);
    await page.getByRole('button', { name: 'واگرد', exact: true }).click();
    await expect(source).toHaveValue(original);
    expect((await rowValues(rich)).map(row => row.length)).toEqual([2, 3, 1, 4]);
    await expect(addColumn).toBeDisabled(); await expect(repair).toBeVisible();
    await page.getByRole('button', { name: 'انجام دوباره', exact: true }).click();
    await expect(source).toHaveValue(repaired);
    await expect(repair).toHaveCount(0);
    await page.screenshot({ path: `artifacts/table-repaired-${width}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.editor-status')).toContainText('ذخیره شد');
    await page.reload();
    if (width < 900) await page.locator('[data-mobile-view="preview"]').click();
    await expect(rich.locator('table tr')).toHaveCount(4);
    expect((await rowValues(rich)).map(row => row.length)).toEqual([4, 4, 4, 4]);
    await expect(source).toHaveValue(repaired);
    expect(errors).toEqual([]);
  });
}

test('row insertion uses header width, row deletion leaves other ragged rows unchanged, and reload agrees', async ({ page }) => {
  const original = before + irregular + after;
  const { rich, source, errors } = await openTable(page, original);
  await rich.locator('table tr').nth(2).locator('td').first().click();
  await page.getByRole('button', { name: 'افزودن ردیف', exact: true }).click();
  expect(await rowValues(rich)).toEqual([
    ['نام', 'سن'], ['علی', '۲۰', 'تهران'], ['سارا'], ['', ''], ['رضا', '۴۰', 'شیراز', 'مهندس'],
  ]);
  await expect(source).not.toHaveValue(original);
  const withRow = await source.inputValue();
  await expect(page.getByRole('button', { name: 'افزودن ستون', exact: true })).toBeDisabled();
  await expect(page.locator('.editor-status')).toContainText('ذخیره شد');
  await page.reload();
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(rich.locator('table tr')).toHaveCount(5);
  expect((await rowValues(rich)).map(row => row.length)).toEqual([2, 3, 1, 2, 4]);
  await expect(source).toHaveValue(withRow);
  await rich.locator('table tr').nth(3).locator('td').first().click();
  await page.getByRole('button', { name: 'حذف ردیف', exact: true }).click();
  expect((await rowValues(rich)).map(row => row.length)).toEqual([2, 3, 1, 4]);
  await expect(page.getByRole('button', { name: repairLabel, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'واگرد', exact: true }).click();
  await expect(source).toHaveValue(withRow);
  expect(errors).toEqual([]);
});

test('typing in an irregular cell preserves widths, extra cells and source outside the table', async ({ page }) => {
  const original = before + irregular + after;
  const { rich, source, errors } = await openTable(page, original);
  const cell = rich.locator('table tr').nth(2).locator('td').first();
  await cell.click(); await page.keyboard.press('Home'); await page.keyboard.insertText('ویرایش ');
  await expect(source).toHaveValue(original.replace('سارا', 'ویرایش سارا'));
  expect((await rowValues(rich)).map(row => row.length)).toEqual([2, 3, 1, 4]);
  await expect(page.getByRole('button', { name: 'حذف ستون', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('repair and tools follow only the selected table and never normalize another table', async ({ page }) => {
  const separator = '\n\nمتن __دست‌نخورده__\n\n';
  const { rich, source, errors } = await openTable(page, before + irregular + separator + table + separator + irregular + after);
  const tables = rich.locator('table');
  await tables.nth(1).locator('td').first().click();
  await expect(page.getByRole('button', { name: repairLabel, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'افزودن ستون', exact: true })).toBeEnabled();
  await tables.nth(2).locator('td').first().click();
  await page.getByRole('button', { name: repairLabel, exact: true }).click();
  expect((await source.inputValue()).startsWith(before + irregular + separator + table + separator)).toBe(true);
  expect(await tables.nth(0).locator('tr').evaluateAll(rows => rows.map(row => row.children.length))).toEqual([2, 3, 1, 4]);
  expect(await tables.nth(2).locator('tr').evaluateAll(rows => rows.map(row => row.children.length))).toEqual([4, 4, 4, 4]);
  await tables.nth(0).locator('td').first().click();
  await expect(page.getByRole('button', { name: repairLabel, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'حذف ستون', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('deleting the only extra-width row makes column tools available without a repair', async ({ page }) => {
  const { rich, errors } = await openTable(page, '| نام | سن |\n| --- | --- |\n| علی | ۲۰ | تهران |\n| سارا | ۳۰ |');
  await page.getByRole('button', { name: 'حذف ردیف', exact: true }).click();
  expect(await rowValues(rich)).toEqual([['نام', 'سن'], ['سارا', '۳۰']]);
  await expect(page.getByRole('button', { name: repairLabel, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'افزودن ستون', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('Tab at the last irregular cell adds a header-width row without repairing the table', async ({ page }) => {
  const { rich, errors } = await openTable(page, irregular);
  await rich.locator('table tr').last().locator('td').last().click();
  await expect(rich).toBeFocused();
  await expect.poll(() => rich.evaluate(element => (element as HTMLElement & { editor: import('@tiptap/core').Editor }).editor.state.selection.$from.parent.textContent)).toBe('مهندس');
  await page.keyboard.press('Tab');
  await expect(rich.locator('table tr')).toHaveCount(5);
  expect((await rowValues(rich)).map(row => row.length)).toEqual([2, 3, 1, 4, 2]);
  await expect(page.getByRole('button', { name: repairLabel, exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('column commands cannot bypass the irregular-table guard', async ({ page }) => {
  const { rich, source, errors } = await openTable(page, irregular);
  const result = await rich.evaluate(element => {
    const editor = (element as HTMLElement & { editor: import('@tiptap/core').Editor }).editor;
    const before = JSON.stringify(editor.getJSON());
    return {
      addBefore: editor.commands.addColumnBefore(),
      addAfter: editor.commands.addColumnAfter(),
      remove: editor.commands.deleteColumn(),
      unchanged: JSON.stringify(editor.getJSON()) === before,
    };
  });
  expect(result).toEqual({ addBefore: false, addAfter: false, remove: false, unchanged: true });
  await expect(source).toHaveValue(irregular);
  expect(errors).toEqual([]);
});
