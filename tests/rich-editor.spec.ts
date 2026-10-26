import { expect, test, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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
  await page.getByRole('combobox', { name: 'سبک پاراگراف', exact: true }).click();
  await page.getByRole('option', { name: 'تیتر ۲', exact: true }).click();
  await expect(rich.locator('h2')).toHaveText('متن نخست و ادامه');
  await page.getByRole('combobox', { name: 'سبک پاراگراف', exact: true }).click();
  await page.getByRole('option', { name: 'متن عادی', exact: true }).click();
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

test('raw source dialogs stay mounted through partial image and multi-block definition edits', async ({ page }) => {
  const rich = await openPreview(page, '> [ref]: https://first.example\n>\n> [x][ref]\n\nbefore ![old](url) &amp; after');
  await page.getByRole('button', { name: 'ویرایش نشانه‌گذاری', exact: true }).first().click();
  const raw = page.getByRole('textbox', { name: 'نشانه‌گذاری Markdown', exact: true });
  await raw.fill('temporary\n\nextra');
  await expect(raw).toHaveValue('temporary\n\nextra');
  await expect(page.locator('.rich-document blockquote p')).toHaveText('[x][ref]');
  await raw.fill('[ref]: https://last.example');
  await expect(page.locator('.rich-document blockquote a')).toHaveAttribute('href', 'https://last.example');
  await page.getByRole('button', { name: 'تأیید', exact: true }).click();
  await page.getByRole('button', { name: 'ویرایش تصویر', exact: true }).click();
  await raw.fill('![new](url'); await expect(raw).toHaveValue('![new](url');
  await raw.fill('temporary'); await expect(raw).toHaveValue('temporary');
  await page.getByRole('button', { name: 'تأیید', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ویرایش نشانه‌گذاری', exact: true }).last()).toHaveText('temporary');
  await expect(page.locator('textarea.markdown-editor')).toHaveValue(/before temporary &amp; after/);
});

test('legacy read-only preview exposes no raw, math or diagram editing controls and keeps its empty action', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async previewPath => {
    const resources = performance.getEntriesByType('resource').map(entry => entry.name);
    const reactPath = resources.find(url => /\/react\.js\?/.test(url))!, domPath = resources.find(url => /\/react-dom_client\.js\?/.test(url))!;
    const reactModule = await import(/* @vite-ignore */ reactPath), domModule = await import(/* @vite-ignore */ domPath), { DocumentPreview } = await import(/* @vite-ignore */ previewPath);
    const React = reactModule.default || reactModule, { createRoot } = domModule.default || domModule;
    const container = document.createElement('aside'); container.id = 'readonly-compatibility'; document.body.append(container);
    const root = createRoot(container);
    const taskWindow = window as unknown as { renderReadonly: (markdown: string) => void; readonlyStarts: number };
    taskWindow.readonlyStarts = 0;
    taskWindow.renderReadonly = markdown => root.render(React.createElement(DocumentPreview, { markdown, direction: 'auto', fontFamily: 'Vazirmatn', fontSize: 12, onStartWriting: () => { taskWindow.readonlyStarts++; } }));
    taskWindow.renderReadonly('![old](url) $x^2$\n\n$$\nx+y\n$$\n\n```mermaid\ngraph LR; A-->B\n```\n\n```math\nx+y\n```');
  }, '/@fs/' + fileURLToPath(new URL('../packages/core/src/DocumentPreview.tsx', import.meta.url)).replaceAll('\\', '/'));
  const panel = page.locator('#readonly-compatibility'), rich = panel.getByRole('textbox', { name: 'پیش‌نمایش', exact: true });
  await expect(rich).toHaveAttribute('aria-readonly', 'true'); await expect(rich).not.toBeEditable();
  await expect(panel.locator('.katex')).toHaveCount(3);
  await expect(panel.locator('button, textarea, input, summary, [contenteditable="true"]')).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { renderReadonly: (markdown: string) => void }).renderReadonly(''));
  await expect(panel).toContainText('برای نوشتن، ویرایش Markdown را باز کن.');
  await panel.getByRole('button', { name: 'شروع نوشتن', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { readonlyStarts: number }).readonlyStarts)).toBe(1);
});
