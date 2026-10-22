import { expect, test, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

async function openPreview(page: Page, source: string) {
  await page.addInitScript(({ source }) => { if (!localStorage.getItem('parsiword-draft-v1')) localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: source, settings: { direction: 'auto' } })); }, { source });
  await page.goto('/');
  await page.locator('[data-mobile-view="preview"]').click();
  return page.getByRole('textbox', { name: 'ویرایش پیش‌نمایش', exact: true });
}

async function selectContents(locator: Locator, collapse = false) {
  await locator.evaluate((element, collapse) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    if (collapse) range.collapse(false);
    const selection = getSelection()!;
    selection.removeAllRanges(); selection.addRange(range);
    (element.closest('[contenteditable="true"]') as HTMLElement).focus();
  }, collapse);
}

test('rich typing and Word-style formatting update Markdown and the downloaded Word file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const rich = await openPreview(page, 'متن نخست');
  await expect(rich).toBeEditable();
  await selectContents(rich.locator('p'), true);
  await page.keyboard.type(' و ادامه');
  await expect(page.locator('textarea.markdown-editor')).toHaveValue('متن نخست و ادامه');
  await selectContents(rich.locator('p'));
  await page.getByRole('button', { name: 'پررنگ', exact: true }).click();
  await expect(rich.locator('strong')).toHaveText('متن نخست و ادامه');
  await page.getByRole('combobox', { name: 'سبک پاراگراف', exact: true }).selectOption('2');
  await expect(rich.locator('h2')).toHaveText('متن نخست و ادامه');
  await page.getByRole('combobox', { name: 'سبک پاراگراف', exact: true }).selectOption('paragraph');
  await page.getByRole('button', { name: 'فهرست بولت‌دار', exact: true }).click();
  await expect(rich.locator('ul > li')).toHaveCount(1);
  await page.getByRole('button', { name: 'فهرست شماره‌دار', exact: true }).click();
  await expect(rich.locator('ol > li')).toHaveCount(1);
  const markdown = page.locator('textarea.markdown-editor');
  await expect(markdown).toHaveValue(/1\. \*\*متن نخست و ادامه\*\*/);
  await page.getByRole('button', { name: 'واگرد', exact: true }).click();
  await expect(rich.locator('ul > li')).toHaveCount(1);
  await page.getByRole('button', { name: 'انجام دوباره', exact: true }).click();
  await expect(rich.locator('ol > li')).toHaveCount(1);
  const expected = await markdown.inputValue();
  await expect(page.locator('.editor-status')).toContainText('ذخیره شد');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).click();
  const zip = await JSZip.loadAsync(await readFile((await (await downloading).path())!));
  expect(await zip.file('word/document.xml')!.async('string')).toContain('متن نخست و ادامه');
  await page.reload();
  await expect(markdown).toHaveValue(expected);
  expect(errors).toEqual([]);
});

test('editing one paragraph preserves code, formulas, diagrams, references and literal syntax', async ({ page }) => {
  const lifecycleWarnings: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('flushSync')) lifecycleWarnings.push(message.text());
  });
  const otherBlocks = String.raw`قیمت \$5 و \$10 است.

\# این تیتر نیست

\- این فهرست نیست

1\. شماره

~~~typescript title="example"
const path = ${String.fromCharCode(96)}a\\b${String.fromCharCode(96)};
console.log("$x", "<script>literal</script>");
~~~

فرمول $x^2$ در متن.

$$
x % توضیح
+ y
$$

~~~mermaid
flowchart LR
 A[شروع] --> B[پایان]
~~~

| نام | مقدار |
| --- | ---: |
| نمونه | 12 |

- [x] انجام شده
- [ ] باقی مانده

[پیوند][ref]

[ref]: https://example.com/a "عنوان"

<div>خام و محفوظ</div>`;
  const source = `پاراگراف قابل ویرایش\n\n${otherBlocks}`;
  const rich = await openPreview(page, source);
  await expect(page.locator('.katex')).toHaveCount(2);
  await expect(page.locator('.mermaid-diagram svg')).toHaveCount(1, { timeout: 30_000 });
  await selectContents(rich.locator(':scope > p').first(), true);
  await page.keyboard.type(' تازه');
  await expect(page.locator('textarea.markdown-editor')).toHaveValue(`پاراگراف قابل ویرایش تازه\n\n${otherBlocks}`);
  await page.locator('[data-mobile-view="edit"]').click();
  const markdown = page.locator('textarea.markdown-editor');
  const value = await markdown.inputValue();
  await markdown.fill(value.replace('قابل ویرایش تازه', 'از Markdown تغییر کرد'));
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(rich.locator(':scope > p').first()).toHaveText('پاراگراف از Markdown تغییر کرد');
  await expect(page.locator('.katex')).toHaveCount(2);
  await expect(page.locator('.mermaid-diagram svg')).toHaveCount(1);
  await expect(page.locator('.prose script, .prose iframe')).toHaveCount(0);
  expect(lifecycleWarnings).toEqual([]);
});

test('multiline display formulas remain multiline when edited in preview', async ({ page }) => {
  await openPreview(page, '$$\nx % comment\n+ y\n$$');
  await page.getByRole('button', { name: 'ویرایش فرمول', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'متن فرمول LaTeX', exact: true });
  await expect(source).toHaveValue('x % comment\n+ y');
  await source.fill('x % comment\n+ y + z');
  await page.getByRole('button', { name: 'تأیید', exact: true }).click();
  await expect(page.locator('textarea.markdown-editor')).toHaveValue('$$\nx % comment\n+ y + z\n$$');
});
