import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';

test('switching editing panes flushes their display delays before the next edit', async ({ page }) => {
  await page.goto('/en');
  const source = page.locator('#markdown-source');
  await source.fill('# Synchronization\n\nPrevious paragraph');
  await expect(page.locator('.rich-document p').first()).toHaveText('Previous paragraph');
  // Stop only display timers: the canonical input and React commits still run
  // in their native event tasks. Neither 200ms nor 120ms can conceal a race.
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await source.fill('# Synchronization\n\nCurrent paragraph');
  await page.locator('[data-mobile-view="preview"]').click();
  const paragraph = page.locator('.rich-document p').first();
  await expect(paragraph).toHaveText('Current paragraph');
  await paragraph.evaluate(element => {
    const range = document.createRange(); range.selectNodeContents(element); range.collapse(false);
    element.closest<HTMLElement>('[contenteditable]')!.focus();
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.execCommand('insertText', false, ' rich');
  });
  await page.locator('[data-mobile-view="edit"]').click();
  await expect(source).toHaveValue('# Synchronization\n\nCurrent paragraph rich');
  await source.press('End'); await source.press('!');
  await expect(source).toHaveValue('# Synchronization\n\nCurrent paragraph rich!');
  await page.locator('[data-mobile-view="preview"]').click();
  await expect(paragraph).toHaveText('Current paragraph rich!');
});

test('desktop rich toolbar receives current source before its same-click transaction', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/en');
  const source = page.locator('#markdown-source');
  await source.fill('# Synchronization\n\nPrevious paragraph');
  await expect(page.locator('.rich-document p').first()).toHaveText('Previous paragraph');
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await source.fill('# Synchronization\n\nCurrent paragraph');
  // Pointer capture synchronizes before the toolbar's click focuses the rich
  // editor and creates its transaction in that same event handler.
  await page.getByRole('button', { name: 'Insert equation', exact: true }).click();
  await source.focus();
  await expect(source).toHaveValue(/Current paragraph/);
  await expect(source).not.toHaveValue(/Previous paragraph/);
  await expect(source).toHaveValue(/\$x\^2\$/);
});

test('export captures immediate source and settings before awaiting font work', async ({ page }) => {
  await page.goto('/en');
  await expect(page.locator('#markdown-source')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.evaluate(() => {
    const setInput = (selector: string, value: string) => {
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setInput('#markdown-source', '# Immediate snapshot\n\nFIRST_SNAPSHOT_TEXT');
    setInput('#document-title', 'First snapshot');
    const exportButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Save Word file')!;
    exportButton.click();
    // Continue changing the same session while export is awaiting its fonts.
    setInput('#markdown-source', '# Later edit\n\nSECOND_SESSION_TEXT');
    setInput('#document-title', 'Later title');
  });
  const file = await download;
  expect(file.suggestedFilename()).toBe('First snapshot.docx');
  const archive = await JSZip.loadAsync(await readFile((await file.path())!));
  const xml = await archive.file('word/document.xml')!.async('string');
  expect(xml).toContain('FIRST_SNAPSHOT_TEXT'); expect(xml).not.toContain('SECOND_SESSION_TEXT');
  await expect(page.locator('#markdown-source')).toHaveValue('# Later edit\n\nSECOND_SESSION_TEXT');
  await expect(page.locator('#document-title')).toHaveValue('Later title');
});

test('oversized saved draft stays complete and source-visible on mobile, with lossless export and shrinking recovery', async ({ page }) => {
  const oversized = 'x'.repeat(500_020);
  await page.addInitScript(markdown => localStorage.setItem('parsiword-draft-v1', JSON.stringify({ markdown, settings: { title: 'Recovery' } })), oversized);
  await page.goto('/en');
  const source = page.locator('#markdown-source');
  await expect(source).toBeVisible(); await expect(source).toHaveValue(oversized);
  await expect(page.getByRole('alert')).toContainText('complete recovered document');
  await expect(page.locator('.rich-document')).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'More export formats', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Save Markdown file', exact: true }).click();
  const file = await pending;
  expect((await readFile((await file.path())!)).toString('utf8')).toBe(oversized);
  await source.fill('x'.repeat(500_010)); await expect(source).toHaveValue('x'.repeat(500_010));
  await source.fill('# Recovered\n\nمتن کامل.');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(source).toHaveValue('# Recovered\n\nمتن کامل.');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('parsiword-draft-v1')!).markdown)).toBe('# Recovered\n\nمتن کامل.');
});
