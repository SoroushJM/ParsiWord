import { test, expect, type Page } from '@playwright/test';

const longParagraph = ('متن بلند فارسی با عبارت English (version 19) و واژه‌های دارای طول متفاوت برای بررسی شکستن واقعی خط در گوشی. ').repeat(16);
const wrappingSource = '# سند با سطرهای بلند\n\n' + Array.from({ length: 12 }, (_, index) =>
  `## Wrapped section ${index}\n\n${longParagraph}\n\n${longParagraph}\n`,
).join('\n');

async function loadDocument(page: Page, markdown: string, width = 320) {
  await page.setViewportSize({ width, height: 851 });
  await page.addInitScript(text => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown: text, settings: { direction: 'auto' } })), markdown);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.prose h2').first()).toBeAttached();
  await expect.poll(() => page.locator('textarea').evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
}

// Ask a real, one-line textarea to reveal its caret. Its native scrollTop gives
// the wrapped source-line position without reimplementing the app's text mirror.
async function nativeSourceLineTop(page: Page, offset: number) {
  await page.locator('textarea').evaluate((element, sourceOffset) => {
    const textarea = element as HTMLTextAreaElement;
    const style = getComputedStyle(textarea);
    const probe = document.createElement('textarea');
    probe.id = 'native-caret-probe';
    for (const property of Array.from(style)) probe.style.setProperty(property, style.getPropertyValue(property));
    Object.assign(probe.style, {
      position: 'fixed', left: '0', top: '0', opacity: '0', pointerEvents: 'none',
      width: `${textarea.getBoundingClientRect().width}px`, height: `${parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)}px`,
      minHeight: '0', maxHeight: 'none', overflow: 'hidden',
    });
    probe.dir = textarea.dir;
    probe.value = textarea.value;
    document.body.append(probe);
    probe.focus({ preventScroll: true });
    probe.setSelectionRange(sourceOffset, sourceOffset);
  }, offset);
  await page.locator('#native-caret-probe').press('ArrowRight');
  return page.locator('#native-caret-probe').evaluate(probe => {
    const style = getComputedStyle(probe);
    const top = probe.scrollTop + parseFloat(style.paddingTop);
    probe.remove();
    return top;
  });
}

async function scrollSourceHeadingToTop(page: Page, markdown: string, heading: string) {
  const lineTop = await nativeSourceLineTop(page, markdown.indexOf(`## ${heading}`));
  await page.locator('textarea').evaluate((element, top) => {
    window.scrollTo({ top: scrollY + element.getBoundingClientRect().top + top - 130, behavior: 'instant' });
  }, lineTop);
}

async function scrollPreviewHeadingToTop(page: Page, heading: string) {
  await page.locator('.prose h2').filter({ hasText: new RegExp(`^${heading}$`) }).evaluate(element => {
    const toolbar = document.querySelector<HTMLElement>('.rich-editor-toolbar')!;
    // It may not have reached its sticky position before the first document
    // scroll. Use the bottom it will occupy once the reading block is in view.
    const toolbarBottom = Math.min(toolbar.getBoundingClientRect().bottom,
      (parseFloat(getComputedStyle(toolbar).top) || 0) + toolbar.offsetHeight);
    window.scrollTo({ top: scrollY + element.getBoundingClientRect().top - toolbarBottom - 40, behavior: 'instant' });
  });
}

async function expectHeadingNearTop(page: Page, heading: string) {
  const gap = async () => {
    const headingBox = await page.locator('.prose h2').filter({ hasText: new RegExp(`^${heading}$`) }).boundingBox();
    const toolbarBox = await page.locator('.rich-editor-toolbar').boundingBox();
    return headingBox && toolbarBox ? headingBox.y - toolbarBox.y - toolbarBox.height : Infinity;
  };
  await expect.poll(gap, { message: `${heading} should remain close to the reading area below the rich toolbar` }).toBeLessThanOrEqual(150);
  await expect.poll(gap, { message: `${heading} should remain visible below the rich toolbar` }).toBeGreaterThanOrEqual(0);
}

test('320px mobile maps native wrapped source lines to the matching preview block', async ({ page }) => {
  await loadDocument(page, wrappingSource);
  await scrollSourceHeadingToTop(page, wrappingSource, 'Wrapped section 6');
  await page.locator('[data-mobile-view="preview"]').click();
  await expectHeadingNearTop(page, 'Wrapped section 6');

  await scrollPreviewHeadingToTop(page, 'Wrapped section 9');
  await page.locator('[data-mobile-view="edit"]').click();
  const lineTop = await nativeSourceLineTop(page, wrappingSource.indexOf('## Wrapped section 9'));
  await expect.poll(() => page.locator('textarea').evaluate((element, top) => element.getBoundingClientRect().top + top, lineTop)).toBeGreaterThan(40);
  const targetTop = await page.locator('textarea').evaluate((element, top) => element.getBoundingClientRect().top + top, lineTop);
  expect(targetTop).toBeLessThan(280);
  await expect(page.locator('textarea')).toHaveValue(wrappingSource);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('preview keeps the reading block when the phone width changes', async ({ page }) => {
  await loadDocument(page, wrappingSource, 393);
  await page.locator('[data-mobile-view="preview"]').click();
  await scrollPreviewHeadingToTop(page, 'Wrapped section 6');
  await expectHeadingNearTop(page, 'Wrapped section 6');
  await page.setViewportSize({ width: 320, height: 851 });
  await expectHeadingNearTop(page, 'Wrapped section 6');
  await page.setViewportSize({ width: 430, height: 851 });
  await expectHeadingNearTop(page, 'Wrapped section 6');
  await expect(page.locator('.editing-pane')).toBeHidden();
});

test('fast rich input followed immediately by a mode switch preserves the edited reading position', async ({ page }) => {
  await loadDocument(page, wrappingSource, 393);
  await page.locator('[data-mobile-view="preview"]').click();
  await scrollPreviewHeadingToTop(page, 'Wrapped section 6');
  const paragraph = page.locator('.prose h2').filter({ hasText: /^Wrapped section 6$/ }).locator('xpath=following-sibling::p[1]');
  const originalRendered = await paragraph.textContent();
  const sectionPrefix = '## Wrapped section 6\n\n';
  const insertionOffset = wrappingSource.indexOf(sectionPrefix) + sectionPrefix.length;
  await paragraph.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    (element.closest('[contenteditable="true"]') as HTMLElement).focus({ preventScroll: true });
  });
  const marker = 'پایان ویرایش سریع';
  const burst = ('افزودن متن سریع با حفظ محل مطالعه در گوشی. ').repeat(45) + marker + ' ';
  // An IME-style input burst rewraps the active paragraph. The mode change has
  // no idle wait after the last input, so pending layout work must use the
  // current document rather than an earlier source snapshot.
  await page.getByRole('textbox', { name: 'ویرایش پیش‌نمایش', exact: true }).pressSequentially('تایپ سریع ', { delay: 0 });
  await page.keyboard.insertText(burst);
  await page.locator('[data-mobile-view="edit"]').click();
  const editor = page.locator('textarea.markdown-editor');
  await expect(editor).toBeVisible();
  const markdown = await editor.inputValue();
  const entered = 'تایپ سریع ' + burst, suffix = wrappingSource.slice(insertionOffset);
  expect(await paragraph.textContent()).toBe(entered + originalRendered);
  expect(markdown.slice(0, insertionOffset)).toBe(wrappingSource.slice(0, insertionOffset));
  expect(markdown.slice(-suffix.length)).toBe(suffix);
  const insertedSource = markdown.slice(insertionOffset, markdown.length - suffix.length);
  // New literal punctuation may be escaped, and a transient trailing space
  // may use an entity. Decode only this newly inserted interval; the source
  // before/after it must remain byte-for-byte identical to the fixture.
  expect(insertedSource.replace(/\\([!-/:-@[-`{-~])/g, '$1').replace(/&#(?:x20|32);/gi, ' ')).toBe(entered);
  const markerOffset = markdown.indexOf(marker) + marker.length;
  const lineTop = await nativeSourceLineTop(page, markerOffset);
  const caretInReadingArea = async () => editor.evaluate((element, top) => {
    const caretY = element.getBoundingClientRect().top + top;
    const toolbarBottom = document.querySelector('.format-toolbar')!.getBoundingClientRect().bottom;
    return caretY >= toolbarBottom - 30 && caretY <= innerHeight + 30;
  }, lineTop);
  await expect.poll(caretInReadingArea, { message: 'The text just entered in preview should remain in the visible Markdown reading area' }).toBe(true);
  await expect(editor).not.toBeFocused();
  expect(await editor.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  await expect(page.locator('.editor-status')).toContainText('ذخیره شد');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('parsiword-draft-v1')!).markdown);
  expect(saved).toBe(markdown);
});

test('a late Mermaid render above the current block preserves the reading position', async ({ page }) => {
  let releaseDiagram!: () => void;
  const diagramGate = new Promise<void>(resolve => { releaseDiagram = resolve; });
  let diagramRequested = false;
  await page.route(/\/node_modules\/\.vite\/deps\/mermaid[^/]*\.js(?:\?|$)/, async route => {
    diagramRequested = true;
    await diagramGate;
    await route.continue();
  });
  const markdown = `# نمودار با بارگذاری دیرهنگام\n\n${longParagraph}\n\n\`\`\`mermaid\nflowchart TD\n  A[Start] --> B[Review]\n  B --> C[Export]\n  C --> D[Finish]\n\`\`\`\n\n## After diagram\n\n${longParagraph}\n\n## Later section\n\n${longParagraph}`;
  try {
    await loadDocument(page, markdown, 393);
    await page.addStyleTag({ content: 'html, body, .preview-panel { overflow-anchor: none !important; }' });
    await page.locator('[data-mobile-view="preview"]').click();
    await expect.poll(() => diagramRequested).toBe(true);
    await expect(page.locator('.preview-panel [role="status"]')).toHaveCount(1);
    await scrollPreviewHeadingToTop(page, 'After diagram');
    await expectHeadingNearTop(page, 'After diagram');
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const heading = page.locator('.prose h2').filter({ hasText: /^After diagram$/ });
    const beforeRender = await heading.evaluate(element => element.getBoundingClientRect().top);
    releaseDiagram();
    await expect(page.locator('.mermaid-diagram svg')).toHaveCount(1, { timeout: 30000 });
    await expectHeadingNearTop(page, 'After diagram');
    await expect.poll(async () => Math.abs(await heading.evaluate(element => element.getBoundingClientRect().top) - beforeRender), {
      message: 'Rendering the diagram should keep the current heading at the same reading position',
    }).toBeLessThanOrEqual(5);
    await expect(page.locator('.preview-panel [role="status"]')).toHaveCount(0);
  } finally {
    releaseDiagram();
  }
});
