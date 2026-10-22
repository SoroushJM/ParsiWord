import { test, expect, type Page } from '@playwright/test';

// Every source line is short enough to fit even at 320px. Rendered tables and
// code have deliberately different heights from the Markdown source. Tables
// precede code so whole-document percentage scrolling cannot mimic block sync.
const source = '# Scroll document\n\n' + Array.from({ length: 40 }, (_, index) => {
  const number = String(index).padStart(2, '0');
  const extra = index < 18
    ? '| A | B |\n| --- | --- |\n' + Array.from({ length: 6 }, () => '| one | two |\n').join('')
    : '```typescript\n' + Array.from({ length: 8 }, (_, line) => `const n${line} = ${index};\n`).join('') + '```\n';
  return `## Section ${number}\n\nمتن کوتاه ${number}.\n\n${extra}\n`;
}).join('\n');

function headingText(index: number) { return `Section ${String(index).padStart(2, '0')}`; }
function sourceOffset(index: number) { return source.indexOf(`## ${headingText(index)}`); }

async function loadDocument(page: Page, width: number) {
  await page.setViewportSize({ width, height: 851 });
  await page.addInitScript(markdown => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { direction: 'auto' } })), source);
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.prose h2')).toHaveCount(40);
  await expect.poll(() => page.locator('textarea').evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
}

// Locate a known source line using its native textarea line height; there is no
// duplicate scroll-map implementation in the test.
async function sourceLineY(page: Page, index: number) {
  return page.locator('textarea').evaluate((element, offset) => {
    const textarea = element as HTMLTextAreaElement;
    const style = getComputedStyle(element);
    const line = textarea.value.slice(0, offset).split('\n').length - 1;
    return element.getBoundingClientRect().top + parseFloat(style.borderTopWidth)
      + parseFloat(style.paddingTop) + line * parseFloat(style.lineHeight);
  }, sourceOffset(index));
}

async function readingInset(page: Page, view: 'edit' | 'preview') {
  return page.evaluate(view => {
    const toolbar = document.querySelector<HTMLElement>(view === 'edit' ? '.format-toolbar' : '.rich-editor-toolbar');
    return toolbar ? (parseFloat(getComputedStyle(toolbar).top) || 0) + toolbar.offsetHeight : 0;
  }, view);
}

async function scrollSourceTo(page: Page, index: number) {
  const y = await sourceLineY(page, index);
  const inset = await readingInset(page, 'edit');
  await page.evaluate(({ top, inset }) => window.scrollTo({ top: scrollY + top - inset - 30, behavior: 'instant' }), { top: y, inset });
}

async function scrollPreviewTo(page: Page, index: number, mobile = false) {
  const inset = await readingInset(page, 'preview');
  await page.locator('.preview-panel').evaluate((panel, { text, mobile, inset }) => {
    const heading = Array.from(panel.querySelectorAll('h2')).find(element => element.textContent === text)!;
    if (mobile) window.scrollTo({ top: scrollY + heading.getBoundingClientRect().top - inset - 30, behavior: 'instant' });
    else panel.scrollTo({ top: panel.scrollTop + heading.getBoundingClientRect().top - panel.getBoundingClientRect().top - inset - 30, behavior: 'instant' });
  }, { text: headingText(index), mobile, inset });
}

async function expectPreviewBlockNearTop(page: Page, index: number, mobile = false) {
  const heading = page.locator('.prose h2').filter({ hasText: new RegExp(`^${headingText(index)}$`) });
  await expect.poll(async () => {
    const box = await heading.boundingBox();
    const panel = await page.locator('.preview-panel').boundingBox();
    if (!box || !panel) return false;
    const inset = await readingInset(page, 'preview');
    const relativeTop = (mobile ? box.y : box.y - panel.y) - inset;
    return relativeTop >= -80 && relativeTop <= 220;
  }).toBe(true);
}

async function expectSourceBlockNearTop(page: Page, index: number) {
  await expect.poll(async () => {
    const y = await sourceLineY(page, index);
    const relativeTop = y - await readingInset(page, 'edit');
    return relativeTop >= -80 && relativeTop <= 220;
  }).toBe(true);
}

test('desktop scrolling follows the matching Markdown block in both directions', async ({ page }) => {
  await loadDocument(page, 1100);
  await scrollSourceTo(page, 12);
  await expectPreviewBlockNearTop(page, 12);
  await scrollPreviewTo(page, 25);
  await expectSourceBlockNearTop(page, 25);
  // Reversing direction must release programmatic-scroll guards.
  await scrollSourceTo(page, 6);
  await expectPreviewBlockNearTop(page, 6);
  expect(await page.locator('textarea').evaluate(element => element.scrollTop)).toBe(0);
});

for (const width of [393, 320]) {
  test(`mobile ${width}px keeps the matching block when switching in either direction`, async ({ page }) => {
    await loadDocument(page, width);
    const editor = page.locator('textarea');
    await editor.evaluate(element => (element as HTMLTextAreaElement).setSelectionRange(20, 24));
    await scrollSourceTo(page, 12);
    await expect.poll(() => page.locator('.mobile-view-switch').evaluate(element => element.getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    await page.locator('[data-mobile-view="preview"]').click();
    await expect(page.locator('.editing-pane')).toBeHidden();
    await expectPreviewBlockNearTop(page, 12, true);
    await scrollPreviewTo(page, 25, true);
    await page.locator('[data-mobile-view="edit"]').click();
    await expect(editor).toBeVisible();
    await expectSourceBlockNearTop(page, 25);
    await expect(editor).toHaveValue(source);
    expect(await editor.evaluate(element => { const textarea = element as HTMLTextAreaElement; return [textarea.selectionStart, textarea.selectionEnd]; })).toEqual([20, 24]);
    await expect(editor).not.toBeFocused();
    expect(await editor.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
