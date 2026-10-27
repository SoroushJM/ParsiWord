import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import { expect, type Browser, type Frame } from '@playwright/test';

export async function testLinkedSelection(browser: Browser, artifact: string, record: (text: string) => void) {
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'linked-selection.md');
  const source = '# انتخاب\r\n\r\n**تکراری English** و [پیوند](https://example.com/one)\r\n\r\n**تکراری English** و [پیوند](https://example.com/two)';
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(source));
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  const page = browser.contexts().flatMap(context => context.pages())[0];
  const viewport = page.viewportSize() ?? await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  await page.setViewportSize({ width: 1500, height: 1000 });
  await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown', { preview: false });
  let frame: Frame | undefined;
  await expect.poll(async () => {
    for (const candidate of browser.contexts().flatMap(context => context.pages()).flatMap(page => page.frames())) {
      try { if (await candidate.locator('.live-workspace[data-mode=combined]').count() && (await candidate.locator('#markdown-source').inputValue()).includes('example.com/two')) { frame = candidate; return true; } } catch { /* Webview mounts asynchronously. */ }
    }
    return false;
  }, { timeout: 20_000 }).toBe(true);
  const view = frame!, input = view.locator('#markdown-source'), doc = await vscode.workspace.openTextDocument(uri);
  const highlights = (pane: string) => view.evaluate(pane => [...(CSS.highlights.get(`parsiword-linked-${pane}`) ?? [])].map(range => range.toString()), pane);
  try {
    await page.bringToFront();
    const start = (await input.inputValue()).lastIndexOf('تکراری English');
    await input.evaluate((element, start) => { const input = element as HTMLTextAreaElement; input.focus(); input.setSelectionRange(start, start + 'تکراری English'.length); }, start);
    await expect.poll(() => highlights('preview')).toEqual(['تکراری English']);
    assert.equal(await view.evaluate(() => {
      const range = [...CSS.highlights.get('parsiword-linked-preview')!][0], paragraphs = document.querySelectorAll('.rich-document > p');
      return range instanceof Range && range.intersectsNode(paragraphs[1]) && !range.intersectsNode(paragraphs[0]);
    }), true);
    await input.press('Control+c');
    await expect.poll(async () => await vscode.env.clipboard.readText()).toBe('تکراری English');
    record('Native combined view maps the selected repeated Markdown phrase to the correct preview block and preserves Ctrl+C');
    await view.locator('.rich-document > p strong').nth(1).evaluate(element => {
      element.closest<HTMLElement>('[contenteditable]')!.focus();
      const range = document.createRange(); range.selectNodeContents(element);
      const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    });
    await expect.poll(() => highlights('source')).toEqual(['تکراری English']);
    assert.equal(await view.evaluate(() => {
      const range = [...CSS.highlights.get('parsiword-linked-source')!][0];
      return range.startContainer.parentElement?.closest<HTMLElement>('[data-source-line]')?.dataset.sourceLine;
    }), '4');
    assert.equal(doc.getText(), source); assert.equal(doc.isDirty, false);
    await page.screenshot({ path: join(artifact, 'linked-selection-vscode.png') });
    record('Preview selection highlights the exact Markdown origin after CRLF conversion without changing native text, dirty state or focus');
    await view.locator('.rich-document').press('Control+c');
    await expect.poll(async () => await vscode.env.clipboard.readText()).toBe('تکراری English');
    await view.locator('.rich-document').press('E');
    await expect.poll(() => doc.getText()).toBe(source.replace(/\*\*تکراری English\*\*(?![\s\S]*\*\*تکراری English\*\*)/, '**E**'));
    await expect.poll(() => highlights('source')).toEqual([]);
    await view.locator('.rich-document').press('Control+z');
    await expect.poll(() => doc.getText()).toBe(source);
    record('Preview native copy, selected-text replacement and shared VS Code undo retain the original Markdown and CRLF');
  } finally { await vscode.workspace.saveAll(false); await vscode.commands.executeCommand('workbench.action.closeAllEditors'); await page.setViewportSize(viewport); }
}
