import { expect, test, type Page, type Locator } from '@playwright/test';

const markdown = '# Selection انتخاب\n\n**تکراری same** و [پیوند](https://example.com/first)\n\n**تکراری same** و [پیوند](https://example.com/second)\n\n- فارسی &amp; English\n- گزینه دوم\n\n```ts\nconst value = 42;\n```';
async function open(page: Page, width = 1400, direction = 'auto') {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(({ markdown, direction }) => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { direction } })), { markdown, direction });
  await page.goto('/en');
  await expect(page.locator('.rich-document > p strong')).toHaveCount(2);
  return page.locator('#markdown-source');
}
async function highlighted(page: Page, pane: 'source' | 'preview') {
  return page.evaluate(pane => [...(CSS.highlights.get(`parsiword-linked-${pane}`) ?? [])].map(range => range.toString()), pane);
}
async function selectPreview(locator: Locator) {
  await locator.evaluate(element => {
    element.closest<HTMLElement>('[contenteditable]')!.focus();
    const range = document.createRange(); range.selectNodeContents(element);
    const native = getSelection()!; native.removeAllRanges(); native.addRange(range);
  });
}
async function selectSource(source: Locator, from: number, to: number) {
  await source.evaluate((element, { from, to }) => {
    const input = element as HTMLTextAreaElement; input.focus(); input.setSelectionRange(from, to);
  }, { from, to });
}
for (const direction of ['auto', 'rtl', 'ltr']) test(`both selections point to the correct repeated formatted text in ${direction}`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const source = await open(page, 1400, direction);
  const start = markdown.lastIndexOf('تکراری same');
  await selectSource(source, 0, 3);
  await expect.poll(() => highlighted(page, 'preview')).toEqual(['S']);
  await selectPreview(page.locator('.rich-document > p strong').nth(1));
  await expect.poll(() => highlighted(page, 'source')).toEqual(['تکراری same']);
  const witness = await page.evaluate(() => {
    const range = [...CSS.highlights.get('parsiword-linked-source')!][0];
    return { line: (range.startContainer.parentElement?.closest('[data-source-line]') as HTMLElement)?.dataset.sourceLine,
      focused: document.activeElement?.classList.contains('rich-document'), selection: getSelection()?.toString(),
      nativeSource: [(document.querySelector('#markdown-source') as HTMLTextAreaElement).selectionStart, (document.querySelector('#markdown-source') as HTMLTextAreaElement).selectionEnd] };
  });
  expect(witness).toEqual({ line: '4', focused: true, selection: 'تکراری same', nativeSource: [0, 3] });
  if (direction === 'auto') await page.screenshot({ path: info.outputPath('preview-to-markdown-selection.png') });
  await selectSource(source, start, start + 'تکراری same'.length);
  await expect.poll(() => highlighted(page, 'preview')).toEqual(['تکراری same']);
  expect(await page.evaluate(() => {
    const range = [...CSS.highlights.get('parsiword-linked-preview')!][0];
    const paragraphs = document.querySelectorAll('.rich-document > p');
    return range.intersectsNode(paragraphs[1]) && !range.intersectsNode(paragraphs[0]);
  })).toBe(true);
  await expect(source).toBeFocused();
  if (direction === 'auto') await page.screenshot({ path: info.outputPath('markdown-to-preview-selection.png') });
  await source.press('ArrowRight');
  await expect.poll(() => highlighted(page, 'preview')).toEqual([]);
  await expect(source).toHaveValue(markdown);
  expect(errors).toEqual([]);
});

test('maps URL syntax, encoded characters, lists and code without editing the draft', async ({ page }) => {
  const source = await open(page);
  for (const [needle, expected] of [['https://example.com/second', 'پیوند'], ['&amp;', '&'], ['const value', 'const value'], ['**تکراری same**', 'تکراری same']]) {
    const at = markdown.lastIndexOf(needle);
    await selectSource(source, at, at + needle.length);
    await expect.poll(() => highlighted(page, 'preview')).toEqual([expected]);
  }
  await selectPreview(page.locator('.rich-document li p').first());
  await expect.poll(() => highlighted(page, 'source')).toEqual(['فارسی &amp; English']);
  await expect(source).toHaveValue(markdown);
  await page.reload(); await expect(source).toHaveValue(markdown);
});

test('plain source gains a visible linked selection and clears it on collapse', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: 'متن ساده بدون قالب', settings: {} })));
  await page.goto('/en');
  await selectPreview(page.locator('.rich-document p'));
  await expect.poll(() => highlighted(page, 'source')).toEqual(['متن ساده بدون قالب']);
  await expect(page.locator('.markdown-source-editor')).toHaveAttribute('data-highlighted', 'true');
  await page.locator('.rich-document p').click();
  await expect.poll(() => highlighted(page, 'source')).toEqual([]);
});

test('mobile pane switches retain both selection directions without moving focus into an editor', async ({ page }) => {
  const source = await open(page, 393);
  const start = markdown.lastIndexOf('تکراری same');
  await selectSource(source, start, start + 'تکراری same'.length);
  await expect.poll(() => highlighted(page, 'preview')).toEqual(['تکراری same']);
  await page.locator('[data-mobile-view="preview"]').click();
  await expect.poll(() => highlighted(page, 'preview')).toEqual(['تکراری same']);
  await expect(page.locator('.rich-document')).not.toBeFocused();
  await selectPreview(page.locator('.rich-document > p strong').nth(1));
  await expect.poll(() => highlighted(page, 'source')).toEqual(['تکراری same']);
  await page.locator('[data-mobile-view="edit"]').click();
  await expect.poll(() => highlighted(page, 'source')).toEqual(['تکراری same']);
  await expect(source).not.toBeFocused(); await expect(source).toHaveValue(markdown);
});

test('selection follows source replacement and rich edits and leaves native typing and undo intact', async ({ page }) => {
  const source = await open(page);
  const next = 'Plain **جدید** paragraph';
  await source.fill(next);
  await expect(page.locator('.rich-document p strong')).toHaveCount(1);
  await expect(page.locator('.rich-document p strong')).toHaveText('جدید');
  await selectSource(source, next.indexOf('جدید'), next.indexOf('جدید') + 4);
  await expect.poll(() => highlighted(page, 'preview')).toEqual(['جدید']);
  await selectPreview(page.locator('.rich-document strong'));
  await expect.poll(() => highlighted(page, 'source')).toEqual(['جدید']);
  await page.keyboard.type('English');
  await expect(source).toHaveValue('Plain **English** paragraph');
  await expect.poll(() => highlighted(page, 'source')).toEqual([]);
  await page.keyboard.press('Control+z');
  await expect(source).toHaveValue(next);
  await selectPreview(page.locator('.rich-document strong'));
  await expect.poll(() => highlighted(page, 'source')).toEqual(['جدید']);
});
