import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { expect, type Browser, type Frame } from '@playwright/test';

export async function testAppearance(browser: Browser, record: (text: string) => void) {
  const folder = vscode.workspace.workspaceFolders![0].uri;
  const uri = vscode.Uri.joinPath(folder, 'sample.md');
  const nativeDocument = await vscode.workspace.openTextDocument(uri), initial = nativeDocument.getText();
  const find = async (selector: string) => {
    let found: Frame | undefined;
    await expect.poll(async () => {
      for (const frame of browser.contexts().flatMap(context => context.pages()).flatMap(page => page.frames())) {
        try { if (await frame.locator(selector).isVisible()) { found = frame; return true; } } catch { /* Switching editors replaces frames. */ }
      }
      return false;
    }, { timeout: 30_000 }).toBe(true);
    return found!;
  };
  const page = browser.contexts().flatMap(context => context.pages())[0];
  await page.setViewportSize({ width: 1500, height: 1000 });
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await vscode.workspace.getConfiguration('parsiword').update('language', 'en', vscode.ConfigurationTarget.Global);
  await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown', { preview: false });
  let frame = await find('#markdown-source');
  const color = (role: string) => frame.locator(`[data-color-role="${role}"]`);
  const open = () => frame.getByRole('button', { name: 'Theme', exact: true }).click();
  await expect(frame.locator('html')).toHaveAttribute('data-theme-preference', 'host');
  const original = await frame.locator('.markdown-source-editor').evaluate(el => getComputedStyle(el).backgroundColor);
  await open();
  await expect(frame.getByRole('radio', { name: 'Follow VS Code', exact: true })).toHaveAttribute('aria-checked', 'true');
  await frame.getByRole('tab', { name: 'Interface and backgrounds', exact: true }).click();
  await color('preview-background').fill('ivory');
  await expect(frame.getByRole('radio', { name: 'Independent ParsiWord theme', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(frame.locator('.markdown-source-editor')).toHaveCSS('background-color', original);
  await expect(frame.locator('.preview-pane')).toHaveCSS('background-color', 'rgb(255, 255, 240)');
  await frame.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(frame.locator('html')).toHaveAttribute('data-theme-preference', 'host');
  await expect(frame.locator('body')).not.toHaveAttribute('data-independent-theme');
  assert.equal(nativeDocument.getText(), initial); assert.equal(nativeDocument.isDirty, false);
  record('First manual edit captures the native VS Code palette; Cancel restores host following without changing the document');

  await open();
  await frame.getByRole('radio', { name: 'Soft purple', exact: true }).click();
  await frame.getByRole('radiogroup', { name: 'Edit palette', exact: true }).getByRole('radio', { name: 'Dark palette', exact: true }).click();
  await frame.getByRole('radiogroup', { name: 'Display mode', exact: true }).getByRole('radio', { name: 'Dark', exact: true }).click();
  await frame.getByRole('tab', { name: 'Code syntax', exact: true }).click();
  await color('syntax-keyword').fill('rgb(255 180 90)');
  await frame.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(frame.locator('html')).toHaveAttribute('data-display-theme', 'dark');
  await expect(frame.locator('.markdown-source-editor')).toHaveCSS('background-color', 'rgb(42, 35, 56)');
  await expect(frame.locator('.rich-document [data-scope=keyword]').first()).toHaveCSS('color', 'rgb(255, 180, 90)');
  await vscode.workspace.getConfiguration('workbench').update('colorTheme', 'Default Light Modern', vscode.ConfigurationTarget.Global);
  await expect(frame.locator('html')).toHaveAttribute('data-display-theme', 'dark');
  assert.equal(nativeDocument.getText(), initial); assert.equal(nativeDocument.isDirty, false);
  record('Independent theme colors apply to real source and preview syntax and remain independent of workbench theme changes');

  const other = vscode.Uri.joinPath(folder, 'other.md');
  await vscode.commands.executeCommand('vscode.openWith', other, 'parsiword.markdown', { preview: false });
  frame = await find('.rich-document p:text-is("Linked document.")');
  await expect(frame.locator('html')).toHaveAttribute('data-display-theme', 'dark');
  await expect(frame.locator('.markdown-source-editor')).toHaveCSS('background-color', 'rgb(42, 35, 56)');
  await open();
  await frame.getByRole('radio', { name: 'Follow VS Code', exact: true }).click();
  await frame.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(frame.locator('html')).toHaveAttribute('data-theme-preference', 'host');
  await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown', { preview: false });
  frame = await find('#markdown-source');
  await expect(frame.locator('html')).toHaveAttribute('data-theme-preference', 'host');
  record('Saved appearance loads in another document, and changing host following broadcasts back to existing webviews');

  const diffUri = vscode.Uri.joinPath(folder, 'preview-links.md');
  const git = await vscode.extensions.getExtension<{ getAPI(version: number): { repositories: { status(): Promise<void> }[] } }>('vscode.git')!.activate();
  await expect.poll(() => git.getAPI(1).repositories.length, { timeout: 20_000 }).toBeGreaterThan(0);
  await git.getAPI(1).repositories[0].status();
  await vscode.commands.executeCommand('parsiword.gitDiff', diffUri);
  frame = await find('.comparison-workspace');
  await expect(frame.getByRole('button', { name: 'Theme', exact: true })).toHaveCount(1);
  await open();
  await frame.getByRole('radio', { name: 'Paper', exact: true }).click();
  await frame.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(frame.locator('html')).toHaveAttribute('data-theme-preference', 'host');
  assert.equal(nativeDocument.getText(), initial); assert.equal(nativeDocument.isDirty, false);
  record('Git comparison exposes one compact Theme button and previews/cancels appearance for both revisions');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
