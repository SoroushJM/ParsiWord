import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, type Browser, type Frame } from '@playwright/test';

type Diagnostics = { getOpenDocuments(): { uri: string; ready: boolean; visible: boolean; comparison?: string; originalUri?: string }[] };

/** Exercise the same vscode.diff entry point and title used by Git's Timeline. */
export async function testHistoryDiff(browser: Browser, api: Diagnostics, artifact: string, record: (text: string) => void) {
  const folder = vscode.workspace.workspaceFolders![0].uri;
  const uri = vscode.Uri.joinPath(folder, 'history file.md');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: folder.fsPath, encoding: 'utf8' }).trim();
  const common = '\n' + Array.from({ length: 16 }, (_, index) => `## بخش مشترک ${index + 1}\n\nمتن فارسی و English برای بررسی نسخهٔ تاریخی.\n`).join('\n');
  const texts = ['HISTORY_FIRST', 'HISTORY_SECOND', 'HISTORY_LATEST'].map(value => `# تاریخچهٔ فارسی\n\nمتن ${value} برای مقایسه.\n${common}`);
  const refs: string[] = [];
  const workbench = vscode.workspace.getConfiguration('workbench');
  const previousAssociations = workbench.inspect('editorAssociations')?.workspaceValue;
  const page = browser.contexts().flatMap(context => context.pages())[0];
  try {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('workbench.action.editorLayoutSingle');
    await workbench.update('editorAssociations', { '*.md': 'parsiword.markdown' }, vscode.ConfigurationTarget.Workspace);
    for (let index = 0; index < texts.length; index++) {
      await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(texts[index]));
      git('add', '--', uri.fsPath);
      git('commit', '--only', '-m', `History revision ${index + 1}`, '--', uri.fsPath);
      refs.push(git('rev-parse', 'HEAD'));
    }
    const gitExtension = await vscode.extensions.getExtension<{ getAPI(version: number): { toGitUri(uri: vscode.Uri, ref: string): vscode.Uri } }>('vscode.git')!.activate();
    const gitApi = gitExtension.getAPI(1);
    const historical = refs.map(ref => gitApi.toGitUri(uri, ref));
    const comparison = async (modifiedText: string) => {
      let found: Frame | undefined;
      await expect(async () => {
        for (const p of browser.contexts().flatMap(context => context.pages())) for (const frame of p.frames()) {
          try {
            if (await frame.locator('.comparison-workspace').isVisible()
              && await frame.locator('.comparison-side[data-comparison-side=modified] .markdown-editor').inputValue() === modifiedText) found = frame;
          } catch { /* Replaced wrapper frame. */ }
        }
        assert.ok(found, 'Historical revisions must be promoted to a comparison workspace');
      }).toPass({ timeout: 20000 });
      return found!;
    };
    for (const [before, after, picker] of [[0, 1, 'first open'], [0, 1, 'reopen'], [0, 1, undefined], [1, 0, undefined]] as const) {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      const title = `history file.md (${refs[before].slice(0, 8)}) ↔ history file.md (${refs[after].slice(0, 8)})`;
      let timeout: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([
          (async () => {
            await vscode.commands.executeCommand('vscode.diff', historical[before], historical[after], title, { preview: false, ...(picker ? { override: false } : {}) });
            // Use the picker command: vscode.diff only forwards boolean overrides.
            if (picker) await vscode.commands.executeCommand('reopenActiveEditorWith', 'parsiword.markdown.diff');
          })(),
          new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(Error('Diff editor resolution stalled before the webview could initialize')), 20000); }),
        ]);
      } finally { clearTimeout(timeout!); }
      const frame = await comparison(texts[after]);
      await expect.poll(() => api.getOpenDocuments().filter(doc => doc.visible && doc.ready && doc.comparison).length).toBe(1);
      const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
      assert.equal(tabs.length, 1);
      assert.ok(tabs[0].input instanceof vscode.TabInputCustom);
      assert.equal(tabs[0].input.viewType, 'parsiword.markdown.diff');
      const session = api.getOpenDocuments().find(doc => doc.visible && doc.comparison)!;
      assert.equal(session.uri, historical[after].toString());
      assert.equal(session.originalUri, historical[before].toString());
      if (await frame.getByRole('button', { name: 'English', exact: true }).count()) await frame.getByRole('button', { name: 'English', exact: true }).click();
      const original = frame.locator('.comparison-side[data-comparison-side=original]');
      const modified = frame.locator('.comparison-side[data-comparison-side=modified]');
      await expect(original.locator('.markdown-editor')).toHaveValue(texts[before]);
      await expect(modified.locator('.markdown-editor')).toHaveValue(texts[after]);
      await expect(original.locator('.comparison-revision')).toContainText(refs[before].slice(0, 8));
      await expect(modified.locator('.comparison-revision')).toContainText(refs[after].slice(0, 8));
      for (const side of [original, modified]) {
        await expect(side.locator('.markdown-editor')).toHaveAttribute('readonly', '');
        await expect(side.locator('.rich-document')).toHaveAttribute('contenteditable', 'false');
      }
      for (const view of ['source', 'rendered'] as const) for (const layout of ['side-by-side', 'inline'] as const) {
        await frame.locator('.comparison-toolbar').getByLabel(view === 'source' ? 'Markdown source' : 'Rendered result', { exact: true }).click();
        await frame.locator('.comparison-toolbar').getByLabel(layout === 'inline' ? 'Inline' : 'Side by side', { exact: true }).click();
        const review = layout === 'inline' ? frame.locator('.comparison-inline') : frame.locator('.comparison-side');
        const selector = layout === 'inline' ? '' : view === 'source' ? '.markdown-source-highlight ' : '.rich-document ';
        await expect(review.locator(`${selector}[data-diff=delete]`).filter({ hasText: before === 0 ? 'HISTORY_FIRST' : 'HISTORY_SECOND' }).first()).toBeVisible();
        await expect(review.locator(`${selector}[data-diff=insert]`).filter({ hasText: after === 0 ? 'HISTORY_FIRST' : 'HISTORY_SECOND' }).first()).toBeVisible();
        if (before === 0 && !picker) await page.screenshot({ path: join(artifact, `history-diff-${view}-${layout}.png`) });
      }
      if (!picker) await page.screenshot({ path: join(artifact, `history-diff-${before}-${after}.png`) });
      await frame.getByRole('button', { name: 'Open comparison in VS Code', exact: true }).click();
      await expect.poll(() => vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputTextDiff).toBe(true);
      const native = vscode.window.tabGroups.activeTabGroup.activeTab!.input as vscode.TabInputTextDiff;
      assert.equal(native.original.toString(), historical[before].toString());
      assert.equal(native.modified.toString(), historical[after].toString());
      for (const token of ['HISTORY_FIRST', 'HISTORY_SECOND']) {
        await expect(page.locator('.monaco-diff-editor .view-lines:visible').filter({ hasText: token }).first()).toBeVisible();
      }
      assert.equal(git('show', `${refs[before]}:history file.md`), texts[before].trimEnd());
      assert.equal(git('show', `${refs[after]}:history file.md`), texts[after].trimEnd());
      record(`${picker ? `Editor-picker ${picker}` : 'Timeline'} commit-to-commit comparison ${before} → ${after} preserves revision order, read-only source/rendered side-by-side/inline highlights and exact native Diff URIs`);
    }
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    for (const [before, after] of [[0, 1], [1, 2]] as const) {
      const title = `history file.md (${refs[before].slice(0, 8)}) ↔ history file.md (${refs[after].slice(0, 8)})`;
      await vscode.commands.executeCommand('vscode.diff', historical[before], historical[after], title, { preview: false });
      const frame = await comparison(texts[after]);
      await expect(frame.locator('.comparison-side[data-comparison-side=original] .markdown-editor')).toHaveValue(texts[before]);
      await expect(frame.locator('.comparison-side[data-comparison-side=modified] .markdown-editor')).toHaveValue(texts[after]);
    }
    await expect.poll(() => vscode.window.tabGroups.all.flatMap(group => group.tabs).length).toBe(2);
    await vscode.commands.executeCommand('vscode.openWith', historical[1], 'parsiword.markdown.diff');
    let restored = await comparison(texts[1]);
    await expect(restored.locator('.comparison-side[data-comparison-side=original] .markdown-editor')).toHaveValue(texts[0]);
    await expect(restored.locator('.comparison-side[data-comparison-side=modified] .markdown-editor')).toHaveValue(texts[1]);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('vscode.openWith', historical[1], 'parsiword.markdown.diff');
    restored = await comparison(texts[1]);
    await expect(restored.locator('.comparison-side[data-comparison-side=original] .markdown-editor')).toHaveValue(texts[0]);
    await expect(restored.locator('.comparison-side[data-comparison-side=modified] .markdown-editor')).toHaveValue(texts[1]);
    await expect(restored.locator('.comparison-side[data-comparison-side=original] .comparison-revision')).toContainText(refs[0].slice(0, 8));
    record('Multiple historical comparison tabs keep their own revision pair, and reopening restores the exact original commit');
    assert.equal(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)), texts[2]);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const orphan = vscode.Uri.joinPath(folder, 'missing comparison.md');
    const orphanText = '# سند بدون نسخهٔ مقایسه\n\nORPHAN_COMPARISON remains readable.\n';
    await vscode.workspace.fs.writeFile(orphan, new TextEncoder().encode(orphanText));
    await vscode.commands.executeCommand('vscode.openWith', orphan, 'parsiword.markdown.diff');
    await expect.poll(() => api.getOpenDocuments().filter(doc => doc.visible && doc.ready && doc.uri === orphan.toString()).length).toBe(1);
    let orphanFrame: Frame | undefined;
    await expect(async () => {
      for (const p of browser.contexts().flatMap(context => context.pages())) for (const frame of p.frames()) {
        try {
          const input = frame.locator('.markdown-editor');
          if (await input.isVisible() && await input.inputValue() === orphanText) orphanFrame = frame;
        } catch { /* Other editor frame. */ }
      }
      assert.ok(orphanFrame, 'A comparison without its original must initialize a readable document');
    }).toPass({ timeout: 10000 });
    await expect(orphanFrame!.locator('.markdown-editor')).toBeVisible();
    await expect(orphanFrame!.locator('.comparison-workspace')).toHaveCount(0);
    assert.equal(vscode.window.tabGroups.all.flatMap(group => group.tabs).length, 1);
    record('A missing comparison original initializes a readable document instead of leaving Loading or opening extra tabs');
  } catch (error) {
    await writeFile(join(artifact, 'history-diff-failure.json'), JSON.stringify({ error: String(error), sessions: api.getOpenDocuments(), tabs: vscode.window.tabGroups.all.map(group => ({ column: group.viewColumn, tabs: group.tabs.map(tab => ({ label: tab.label, input: tab.input, kind: tab.input?.constructor.name })) })) }, null, 2));
    await page.screenshot({ path: join(artifact, 'history-diff-failure.png') }).catch(() => {});
    throw error;
  } finally {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await workbench.update('editorAssociations', previousAssociations, vscode.ConfigurationTarget.Workspace);
  }
}
