import { expect, test, type Locator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { readFile } from 'node:fs/promises';

async function openPreview(page: Page, source: string) {
  await page.setViewportSize({ width: 393, height: 851 });
  await page.addInitScript(markdown => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { direction: 'auto' } })), source);
  await page.goto('/');
  await page.locator('[data-mobile-view="preview"]').click();
  const rich = page.getByRole('textbox', { name: 'ویرایش پیش‌نمایش', exact: true });
  await expect(rich).toBeEditable();
  await page.evaluate(() => document.fonts.ready);
  return rich;
}

async function placeCaretAtEnd(paragraph: Locator) {
  await paragraph.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    (element.closest('[contenteditable="true"]') as HTMLElement).focus();
  });
}

test('native IME composition commits Persian text once without resetting the caret', async ({ page }) => {
  const rich = await openPreview(page, 'آغاز متن');
  await placeCaretAtEnd(rich.locator(':scope > p').first());
  const events: { type: string; composing?: boolean }[] = [];
  await page.exposeFunction('recordCompositionEvent', (event: { type: string; composing?: boolean }) => events.push(event));
  await rich.evaluate(element => {
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend', 'input']) {
      element.addEventListener(type, event => {
        (window as unknown as { recordCompositionEvent: (event: { type: string; composing?: boolean }) => void }).recordCompositionEvent({
          type: event.type, composing: 'isComposing' in event ? (event as InputEvent).isComposing : undefined,
        });
      });
    }
  });
  const cdp = await page.context().newCDPSession(page);
  for (const text of [' ف', ' فار', ' فارسی']) {
    await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
  }
  await cdp.send('Input.insertText', { text: ' فارسی' });
  await page.keyboard.insertText(' پایان');
  await expect(rich.locator(':scope > p').first()).toHaveText('آغاز متن فارسی پایان');
  await expect(page.locator('textarea.markdown-editor')).toHaveValue('آغاز متن فارسی پایان');
  expect(events.some(event => event.type === 'compositionstart')).toBe(true);
  expect(events.some(event => event.type === 'input' && event.composing)).toBe(true);
  expect(events.some(event => event.type === 'compositionend')).toBe(true);
  await cdp.detach();
});

test('export immediately after rich input includes the final characters without waiting for autosave', async ({ page }) => {
  const rich = await openPreview(page, 'متن نخست');
  await placeCaretAtEnd(rich.locator(':scope > p').first());
  const downloading = page.waitForEvent('download');
  await page.keyboard.insertText(' آخرین تغییر FASTINPUT42');
  // Click in the next browser task without scrolling to the header or waiting
  // for a debounce/autosave indicator to give a stale draft time to catch up.
  await page.getByRole('button', { name: /ذخیرهٔ فایل Word/ }).evaluate(button => (button as HTMLButtonElement).click());
  const download = await downloading;
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const xml = await zip.file('word/document.xml')!.async('string');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const text = Array.from(document.getElementsByTagName('w:t')).map(element => element.textContent).join('').replace(/\u200e/g, '');
  expect(text).toContain('متن نخست آخرین تغییر FASTINPUT42');
});

test('a rapid burst in the real starter document keeps every character and unrelated rich nodes', async ({ page }) => {
  const source = await readFile('packages/core/src/default-document.md', 'utf8');
  const rich = await openPreview(page, source);
  await expect(page.locator('.mermaid-diagram svg')).toHaveCount(2, { timeout: 30_000 });
  const untouchedCode = rich.locator('.code-block').first();
  const codeHandle = (await untouchedCode.elementHandle())!;
  const codeText = await untouchedCode.textContent();
  const tableHandle = (await rich.locator('table').first().elementHandle())!;
  await placeCaretAtEnd(rich.locator(':scope > p').first());
  const burst = ' inputburst0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  await page.keyboard.type(burst, { delay: 0 });
  await expect(rich.locator(':scope > p').first()).toContainText(burst);
  // An edit in an ordinary paragraph must retain the unaffected NodeViews and
  // table DOM. Replacing the whole rich document is a costly typing regression.
  expect(await codeHandle.evaluate(element => element.isConnected)).toBe(true);
  expect(await tableHandle.evaluate(element => element.isConnected)).toBe(true);
  expect(await untouchedCode.textContent()).toBe(codeText);
  // The inactive source textarea may buffer its display while rich typing is
  // active; selecting it must immediately reveal the current canonical draft.
  await page.locator('[data-mobile-view="edit"]').click();
  const markdown = await page.locator('textarea.markdown-editor').inputValue();
  expect(markdown.split(burst)).toHaveLength(2);
});

test('the Markdown limit counts escaping and still permits deletion at the boundary', async ({ page }) => {
  test.setTimeout(90_000);
  const source = 'x'.repeat(499_998);
  const rich = await openPreview(page, source);
  const expectMarkdownTail = async (tail: string) => {
    await expect.poll(async () => {
      const text = await page.locator('textarea.markdown-editor').inputValue();
      return { length: text.length, prefixPreserved: text.startsWith(source), tail: text.slice(source.length) };
    }).toEqual({ length: source.length + tail.length, prefixPreserved: true, tail });
  };
  await placeCaretAtEnd(rich.locator(':scope > p').first());
  await page.keyboard.insertText('*');
  await expectMarkdownTail('\\*');
  await page.keyboard.insertText('z');
  const richText = await rich.locator(':scope > p').first().textContent();
  expect({ length: richText?.length, prefixPreserved: richText?.startsWith(source), tail: richText?.slice(source.length) })
    .toEqual({ length: source.length + 1, prefixPreserved: true, tail: '*' });
  await expectMarkdownTail('\\*');
  await page.keyboard.press('Backspace');
  await expectMarkdownTail('');
  await page.keyboard.insertText('z');
  await expectMarkdownTail('z');
});
