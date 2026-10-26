import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { expect, type Browser, type Frame } from '@playwright/test';

type Diagnostics = { getOpenDocuments(): { uri: string; ready: boolean; visible: boolean; comparison?: string }[] };
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(read: () => T | PromiseLike<T>, predicate: (value: T) => boolean, label: string): Promise<T> {
  for (let i = 0; i < 100; i++) { const value = await read(); if (predicate(value)) return value; await wait(200); }
  throw Error(`Timed out: ${label}`);
}

export async function testGitDiff(browser: Browser, api: Diagnostics, artifact: string, record: (text: string) => void) {
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'nested folder/nested.md');
  const doc = await vscode.workspace.openTextDocument(uri);
  const page = browser.contexts().flatMap(context => context.pages())[0];
  const frames = async () => {
    const result: Record<string, Frame> = {};
    for (const p of browser.contexts().flatMap(context => context.pages())) for (const frame of p.frames()) {
      try { const side = await frame.locator('.app-shell').getAttribute('data-comparison', { timeout: 100 }); if (side) result[side] = frame; } catch { /* Other workbench frames are not ParsiWord. */ }
    }
    return result;
  };
  const pair = async () => {
    await until(() => api.getOpenDocuments(), docs => docs.filter(item => item.visible && item.ready && item.comparison).length === 2, 'both custom Git comparison sessions');
    return until(frames, value => !!value.original && !!value.modified, 'rendered comparison frames');
  };
  const workbench = vscode.workspace.getConfiguration('workbench');
  const previousTheme = workbench.inspect('colorTheme')?.workspaceValue;
  const previousAssociations = workbench.inspect('editorAssociations')?.workspaceValue;
  try {
    // Leave another native editor with its own undo history before entering the
    // comparison. A global Undo must never reach this unrelated document.
    const decoyUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'other.md');
    const decoy = await vscode.workspace.openTextDocument(decoyUri);
    const nativeEditor = await vscode.window.showTextDocument(decoy);
    await nativeEditor.edit(edit => edit.insert(new vscode.Position(0, 0), '<!-- unrelated history -->\n'));
    await decoy.save();
    const decoyText = decoy.getText();
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    // Reproduce the user's default editor association without changing personal settings.
    await workbench.update('editorAssociations', { '*.md': 'parsiword.markdown' }, vscode.ConfigurationTarget.Workspace);
    await vscode.commands.executeCommand('git.refresh');
    await vscode.commands.executeCommand('git.openChange', uri);
    let { original, modified } = await pair();
    assert.equal(vscode.window.tabGroups.all.filter(group => group.activeTab?.input instanceof vscode.TabInputCustom).length, 2);
    for (const frame of [original, modified]) {
      const persian = frame.getByRole('link', { name: 'فارسی', exact: true });
      if (await persian.count()) await persian.click();
    }
    await expect(original.locator('#markdown-source')).toHaveAttribute('readonly', '');
    await expect(original.locator('.rich-document')).toHaveAttribute('contenteditable', 'false');
    await expect(modified.locator('#markdown-source')).not.toHaveAttribute('readonly', '');
    await expect(original.locator('#markdown-source')).toHaveValue(/STAGED/);
    await expect(modified.locator('#markdown-source')).toHaveValue(/WORKING/);
    await expect(original.locator('.markdown-source-highlight [data-source-line][data-diff=delete]').first()).toBeVisible();
    await expect(modified.locator('.markdown-source-highlight [data-source-line][data-diff=insert]').first()).toBeVisible();
    await expect(original.locator('[data-diff-word=delete]').first()).toBeVisible();
    await expect(modified.locator('[data-diff-word=insert]').first()).toBeVisible();
    record('Source Control Git changes retain both RTL ParsiWord views with red/green line and word highlights');
    await page.screenshot({ path: join(artifact, 'git-diff-source.png') });

    const before = doc.getText(), revision = await original.locator('#markdown-source').inputValue();
    const originalSource = original.locator('#markdown-source');
    await originalSource.click();
    await originalSource.press('Control+h');
    await expect(original.locator('#editor-find-query')).toBeFocused();
    await original.locator('#editor-find-query').fill('STAGED');
    await expect(original.locator('.search-count')).not.toHaveText(/نتیجه‌ای نیست/);
    await expect(original.locator('#editor-replace-text')).toBeDisabled();
    await original.locator('#editor-find-query').press('Escape');
    await originalSource.press('Control+a'); await originalSource.press('Control+x'); await originalSource.press('Control+v'); await originalSource.press('Control+z');
    await expect(originalSource).toHaveValue(revision);
    assert.equal(doc.getText(), before);
    const modifiedSource = modified.locator('#markdown-source');
    await modifiedSource.click();
    await modifiedSource.press('Control+h');
    await modified.locator('#editor-find-query').fill('WORKING'); await modified.locator('#editor-replace-text').fill('SEARCH_REPLACED');
    await modified.getByRole('button', { name: 'جایگزینی', exact: true }).click();
    await until(() => doc.getText(), text => text === before.replace('WORKING', 'SEARCH_REPLACED'), 'replacement in modified comparison');
    await modified.locator('#editor-find-query').press('Escape'); await modifiedSource.press('Control+z');
    await until(() => doc.getText(), text => text === before, 'comparison replacement undo');
    await expect(modifiedSource).toHaveValue(before);
    record('Real search/replace shortcuts respect Git revision read-only boundaries and modified-side native Undo');
    let historyReason: vscode.TextDocumentChangeReason | undefined;
    const history = vscode.workspace.onDidChangeTextDocument(event => { if (event.document === doc && event.contentChanges.length) historyReason = event.reason; });
    const next = before.replace('WORKING', 'EDITED_FROM_DIFF');
    await modified.locator('#markdown-source').fill(next);
    await until(() => doc.getText(), text => text === next, 'comparison edit updates native document');
    await expect(original.locator('#markdown-source')).toHaveValue(revision);
    await expect(modified.locator('[data-diff-word=insert]').filter({ hasText: 'EDITED_FROM_DIFF' })).toBeVisible();
    await modified.locator('#markdown-source').press('Control+z');
    await until(() => doc.getText(), text => text === before, 'undo in comparison');
    assert.equal(historyReason, vscode.TextDocumentChangeReason.Undo, 'Comparison Undo must use the target TextDocument history, not browser history');
    assert.equal(decoy.getText(), decoyText, 'Comparison Undo modified an unrelated native document');
    await modified.locator('#markdown-source').press('Control+Shift+z');
    await until(() => doc.getText(), text => text === next, 'redo in comparison');
    assert.equal(historyReason, vscode.TextDocumentChangeReason.Redo);
    history.dispose();
    await modified.locator('#markdown-source').press('Control+s');
    await until(() => doc.isDirty, value => !value, 'save in comparison');
    assert.equal(await readFile(uri.fsPath, 'utf8'), next);
    record('Editing, native undo/redo and save work in the modified diff while the Git revision stays read-only');

    await modified.getByRole('button', { name: 'تغییر بعدی', exact: true }).click();
    await expect(original.locator('.diff-toolbar nav span')).toHaveText(await modified.locator('.diff-toolbar nav span').textContent() ?? '');
    record('Change navigation reaches the same change in both custom comparison views');
    for (const frame of [original, modified]) await frame.locator('[data-mobile-view=preview]').click();
    await expect(original.locator('.rich-document > [data-diff=delete]').first()).toBeVisible();
    await expect(modified.locator('.rich-document > [data-diff=insert]').first()).toBeVisible();
    assert.equal(doc.getText(), next);
    for (const frame of [original, modified]) await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: join(artifact, 'git-diff-preview.png') });
    record('Both rendered RTL previews highlight changed blocks without inserting decoration into Markdown');

    await modified.getByRole('link', { name: 'English', exact: true }).click();
    await expect(modified.getByRole('button', { name: 'Next change', exact: true })).toBeVisible();
    await expect(modified.locator('.diff-toolbar')).toContainText('Working tree');
    await workbench.update('colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Workspace);
    await expect(page.locator('.monaco-workbench')).toHaveClass(/vs-dark/);
    for (const frame of [original, modified]) await frame.locator('[data-mobile-view=edit]').click();
    const color = await modified.locator('.markdown-source-highlight [data-source-line][data-diff=insert]').first().evaluate(element => getComputedStyle(element).backgroundColor);
    assert.notEqual(color, 'rgba(0, 0, 0, 0)');
    await page.screenshot({ path: join(artifact, 'git-diff-dark.png') });
    record('Bilingual controls and visible diff backgrounds work in the dark VS Code theme');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('parsiword.stagedDiff', uri);
    ({ original, modified } = await pair());
    await expect(original.locator('#markdown-source')).toHaveValue(/ORIGINAL/);
    await expect(modified.locator('#markdown-source')).toHaveValue(/STAGED/);
    for (const frame of [original, modified]) {
      await expect(frame.locator('#markdown-source')).toHaveAttribute('readonly', '');
      await expect(frame.locator('.rich-document')).toHaveAttribute('contenteditable', 'false');
    }
    await expect(original.locator('.markdown-source-highlight [data-diff=delete]').first()).toBeVisible();
    await expect(modified.locator('.markdown-source-highlight [data-diff=insert]').first()).toBeVisible();
    await page.screenshot({ path: join(artifact, 'git-diff-staged.png') });
    record('Staged custom comparisons highlight HEAD versus index; both revision documents are read-only');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('parsiword.gitDiff', uri);
    ({ original, modified } = await pair());
    await expect(original.locator('#markdown-source')).toHaveValue(/STAGED/);
    await expect(modified.locator('#markdown-source')).toHaveValue(/EDITED_FROM_DIFF/);
    record('The ParsiWord Git diff command uses the same highlighted custom comparison as Source Control');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('vscode.open', uri);
    await until(() => api.getOpenDocuments(), docs => docs.some(item => item.visible && item.ready && item.uri === uri.toString() && !item.comparison), 'ordinary editor has no stale comparison');
    assert.ok(vscode.window.tabGroups.all.flatMap(group => group.tabs).some(tab => tab.input instanceof vscode.TabInputCustom && tab.input.viewType === 'parsiword.markdown'));
    record('Returning to a regular Markdown file preserves ParsiWord editing and clears comparison decoration');
  } finally {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await workbench.update('colorTheme', previousTheme, vscode.ConfigurationTarget.Workspace);
    await workbench.update('editorAssociations', previousAssociations, vscode.ConfigurationTarget.Workspace);
  }
}
