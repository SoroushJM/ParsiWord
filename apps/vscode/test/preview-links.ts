import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { expect, type Browser, type Frame, type Locator } from '@playwright/test';

export async function testPreviewLinks(browser: Browser, record: (text: string) => void) {
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'preview-links.md');
  const doc = await vscode.workspace.openTextDocument(uri), initial = doc.getText();
  const page = browser.contexts().flatMap(context => context.pages())[0];
  const viewport = page.viewportSize() ?? await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const opened: string[] = [];
  const env = vscode.env as { openExternal: typeof vscode.env.openExternal }, original = env.openExternal;
  // Exercise the real webview IPC and extension dispatcher, without launching
  // the user's browser from an automated test.
  env.openExternal = async target => { opened.push(target.toString(true)); return true; };
  const find = async (selector: string) => {
    let found: Frame | undefined;
    await expect.poll(async () => {
      for (const frame of browser.contexts().flatMap(context => context.pages()).flatMap(page => page.frames())) {
        try { if (await frame.locator(selector).isVisible()) { found = frame; return true; } } catch { /* A new webview replaces the previous frame. */ }
      }
      return false;
    }, { timeout: 20_000 }).toBe(true);
    return found!;
  };
  const follow = async (link: Locator, target: string, modifier: 'Control' | 'Meta' = 'Control') => {
    const expected = [...opened, target];
    await link.click({ modifiers: [modifier] });
    await expect.poll(() => opened).toEqual(expected);
    assert.equal(doc.getText(), initial); assert.equal(doc.isDirty, false);
  };
  try {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    await page.setViewportSize({ width: 1500, height: 1000 });
    await page.bringToFront();
    await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown', { preview: false });
    let frame = await find('.rich-document a[href="https://example.test/modified"]');
    await frame.locator('.rich-document a strong').click();
    await expect(frame.locator('.rich-document')).toBeFocused();
    assert.deepEqual(opened, []);
    await follow(frame.locator('.rich-document a strong'), 'https://example.test/modified');
    await follow(frame.locator('.rich-document table a'), 'https://example.test/table', 'Meta');
    record('Ctrl/Command+click follows formatted and table links through VS Code openExternal once; ordinary clicks keep editing and the document stays clean');

    await frame.locator('.rich-document a[href="./other.md"]').click({ modifiers: ['Control'] });
    await expect.poll(() => vscode.window.tabGroups.all.flatMap(group => group.tabs).filter(tab => tab.input instanceof vscode.TabInputCustom && tab.input.uri.path.endsWith('/other.md')).length).toBe(1);
    assert.equal(vscode.window.tabGroups.all.flatMap(group => group.tabs).length, 2);
    await find('.rich-document p:text-is("Linked document.")');
    assert.equal(doc.getText(), initial); assert.equal(doc.isDirty, false);
    record('Ctrl+click on a relative Markdown link opens its document in a separate VS Code tab');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const git = await vscode.extensions.getExtension<{ getAPI(version: number): { repositories: { status(): Promise<void>; state: { workingTreeChanges: { uri: vscode.Uri }[] } }[] } }>('vscode.git')!.activate();
    await expect.poll(() => git.getAPI(1).repositories.length, { timeout: 20_000 }).toBeGreaterThan(0);
    await git.getAPI(1).repositories[0].status();
    await expect.poll(() => git.getAPI(1).repositories[0].state.workingTreeChanges.some(change => change.uri.toString() === uri.toString())).toBe(true);
    await vscode.commands.executeCommand('parsiword.gitDiff', uri);
    frame = await find('.comparison-workspace');
    await frame.locator('.comparison-toolbar').getByLabel('Rendered result', { exact: true }).click();
    const before = frame.locator('.comparison-side[data-comparison-side=original] .rich-document');
    const after = frame.locator('.comparison-side[data-comparison-side=modified] .rich-document');
    await expect(before).toHaveAttribute('contenteditable', 'false');
    await follow(before.locator('a strong'), 'https://example.test/original');
    await follow(after.locator('a strong'), 'https://example.test/modified');
    record('Rendered Git comparison follows links from both the read-only original and current revision without editing either');
    await frame.locator('.comparison-toolbar').getByLabel('Inline', { exact: true }).click();
    await follow(frame.locator('.comparison-inline [data-diff=delete] a strong'), 'https://example.test/original');
    await follow(frame.locator('.comparison-inline [data-diff=insert] a strong'), 'https://example.test/modified');
    assert.equal(opened.length, 6);
    record('Unified Git comparison also routes deleted and added links through the host exactly once');
  } finally {
    env.openExternal = original;
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await page.setViewportSize(viewport);
  }
}
