import { expect, test, type Page } from '@playwright/test';

const mixedLine = 'متن فارسی با English (version **19**) و [پیوند](https://example.com/path?q=1) و نشانه‌های (مرحله ۲)؛ ';
const source = '# عنوان فارسی React 19\n\n**پررنگ** و *مورب* و ~~خط‌خورده~~ در متن.\n\nکد: `const n = 19;` و [پیوند](https://example.com).\n\n> نقل‌قول فارسی\n\n- مورد نخست\n- مورد دوم\n\n```typescript\n\tconst literal = "<img src=x onerror=alert(1)>";\n```\n\n<img src=x onerror="window.__markdownSourceExecuted=true">\n\n'
  + Array.from({ length: 8 }, (_, index) => `## بخش ${index}\n\n${mixedLine.repeat(7)}NATIVE_ALIGN_${index}\n\n`).join('') + '\tپایان  \n';

async function openSource(page: Page, width: number, markdown = source) {
  await page.setViewportSize({ width, height: 851 });
  await page.addInitScript(text => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: text, settings: { direction: 'auto' } })), markdown);
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.markdown-source-editor')).toHaveAttribute('data-highlighted', 'true');
  await expect(page.getByRole('textbox', { name: 'متن Markdown', exact: true })).toHaveValue(markdown);
}

// The browser reveals a real textarea caret in a one-line viewport. This gives
// native wrap positions without copying the overlay's rendering algorithm.
async function nativeCaretTop(page: Page, offset: number) {
  await page.locator('textarea.markdown-editor').evaluate((element, offset) => {
    const textarea = element as HTMLTextAreaElement;
    const style = getComputedStyle(textarea);
    const probe = document.createElement('textarea');
    for (const property of Array.from(style)) probe.style.setProperty(property, style.getPropertyValue(property));
    Object.assign(probe.style, {
      position: 'fixed', left: '0', top: '0', opacity: '0', pointerEvents: 'none',
      width: `${textarea.getBoundingClientRect().width}px`,
      height: `${parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)}px`,
      minHeight: '0', maxHeight: 'none', overflow: 'hidden',
    });
    probe.id = 'source-highlight-caret-probe';
    probe.dir = textarea.dir;
    probe.value = textarea.value;
    document.body.append(probe);
    probe.focus({ preventScroll: true });
    probe.setSelectionRange(offset, offset);
  }, offset);
  await page.locator('#source-highlight-caret-probe').press('ArrowRight');
  return page.locator('#source-highlight-caret-probe').evaluate(element => {
    const top = element.scrollTop;
    element.remove();
    return top;
  });
}

async function highlightedGlyphTop(page: Page, offset: number) {
  return page.locator('.markdown-source-highlight').evaluate((element, offset) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent?.length || 0;
      if (offset < length) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.setEnd(node, offset + 1);
        return range.getBoundingClientRect().top - element.getBoundingClientRect().top;
      }
      offset -= length;
    }
    throw new Error('Highlighted source lost a character offset');
  }, offset);
}

for (const width of [320, 1100]) {
  test(`${width}px source colors preserve literal Markdown and native mixed-direction wrapping`, async ({ page }) => {
    await openSource(page, width);
    const overlay = page.locator('.markdown-source-highlight');
    const editor = page.getByRole('textbox', { name: 'متن Markdown', exact: true });
    await expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(await overlay.textContent()).toBe(source);
    await expect(editor).toBeEditable();
    await expect(page.getByRole('textbox', { name: 'متن Markdown', exact: true })).toHaveCount(1);
    const colors: string[] = [];
    for (const token of ['heading', 'strong', 'code']) {
      const span = overlay.locator(`[data-md-token="${token}"]`).first();
      await expect(span).toBeVisible();
      colors.push(await span.evaluate(element => getComputedStyle(element).color));
      await expect(span).toHaveCSS('font-weight', await editor.evaluate(element => getComputedStyle(element).fontWeight));
      await expect(span).toHaveCSS('font-style', await editor.evaluate(element => getComputedStyle(element).fontStyle));
    }
    expect(new Set(colors).size).toBeGreaterThan(1);
    expect(colors.every(color => color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent')).toBe(true);
    for (const property of ['font-family', 'font-size', 'line-height', 'letter-spacing', 'tab-size']) {
      const expected = await editor.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property);
      await expect(overlay).toHaveCSS(property, expected);
    }
    await expect(overlay.locator('img, script, iframe')).toHaveCount(0);
    expect(await page.evaluate(() => '__markdownSourceExecuted' in window)).toBe(false);
    // A deep caret is scrolled just far enough to expose its glyph. At source
    // offset zero, scrollTop is instead pinned to zero, so that initial caret
    // has a different leading/padding offset. Compare distant markers with
    // each other; cumulative wrap drift still appears in these native deltas.
    const firstMarkerOffset = source.indexOf('NATIVE_ALIGN_0') + 5;
    const nativeOrigin = await nativeCaretTop(page, firstMarkerOffset);
    const highlightedOrigin = await highlightedGlyphTop(page, firstMarkerOffset);
    for (const index of [0, 3, 7]) {
      const offset = source.indexOf(`NATIVE_ALIGN_${index}`) + 5;
      const nativeDelta = await nativeCaretTop(page, offset) - nativeOrigin;
      const highlightedDelta = await highlightedGlyphTop(page, offset) - highlightedOrigin;
      expect(Math.abs(nativeDelta - highlightedDelta), `wrapped source marker ${index}`).toBeLessThanOrEqual(2);
    }
    expect(await editor.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(editor).toHaveValue(source);
  });
}

test('native source selection and Persian IME composition retain exactly one committed edit', async ({ page }) => {
  const original = '# عنوان\n\nآغاز متن';
  await openSource(page, 393, original);
  const editor = page.getByRole('textbox', { name: 'متن Markdown', exact: true });
  await editor.focus();
  await editor.evaluate(element => {
    const textarea = element as HTMLTextAreaElement;
    const start = textarea.value.indexOf('عنوان');
    textarea.setSelectionRange(start, start + 'عنوان'.length);
  });
  await page.keyboard.insertText('تیتر تازه');
  const replaced = '# تیتر تازه\n\nآغاز متن';
  await expect(editor).toHaveValue(replaced);
  await editor.press('Control+End');
  const cdp = await page.context().newCDPSession(page);
  for (const text of [' ف', ' فار', ' فارسی']) {
    await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    await expect(page.locator('.markdown-source-editor')).toHaveAttribute('data-highlighted', 'false');
    await expect(editor).toBeFocused();
  }
  await cdp.send('Input.insertText', { text: ' فارسی' });
  await page.keyboard.insertText(' پایان');
  const expected = replaced + ' فارسی پایان';
  await expect(editor).toHaveValue(expected);
  await expect(page.locator('.markdown-source-editor')).toHaveAttribute('data-highlighted', 'true');
  await expect.poll(() => page.locator('.markdown-source-highlight').textContent()).toBe(expected);
  expect(await editor.evaluate(element => (element as HTMLTextAreaElement).selectionStart)).toBe(expected.length);
  await expect(page.locator('.editor-status')).toContainText('ذخیره شد');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('parsiword-draft-v1')!).markdown)).toBe(expected);
  await cdp.detach();
});

test('the highlighted source stays aligned while scrolling and survives a mobile view switch', async ({ page }) => {
  await openSource(page, 393);
  const editor = page.getByRole('textbox', { name: 'متن Markdown', exact: true });
  await page.evaluate(() => scrollTo(0, 1400));
  await expect.poll(() => page.locator('.mobile-view-switch').evaluate(element => element.getBoundingClientRect().top)).toBeLessThanOrEqual(1);
  const before = await page.evaluate(() => scrollY);
  await editor.evaluate(element => {
    const textarea = element as HTMLTextAreaElement;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(5, 17);
  });
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(page.locator('.editing-pane')).toBeHidden();
  await page.locator('[data-mobile-view="edit"]').click();
  await expect(editor).toHaveValue(source);
  expect(await page.locator('.markdown-source-highlight').textContent()).toBe(source);
  expect(await editor.evaluate(element => {
    const textarea = element as HTMLTextAreaElement;
    return [textarea.selectionStart, textarea.selectionEnd];
  })).toEqual([5, 17]);
  await expect(editor).not.toBeFocused();
  expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThan(180);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
