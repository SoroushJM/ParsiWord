import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, type Browser, type Frame } from '@playwright/test';

type Diagnostics = { getOpenDocuments(): { uri: string; ready: boolean; visible: boolean; comparison?: string }[] };
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(read: () => T | PromiseLike<T>, predicate: (value: T) => boolean, label: string): Promise<T> {
  for (let i = 0; i < 100; i++) { const value = await read(); if (predicate(value)) return value; await wait(200); }
  throw Error(`Timed out: ${label}`);
}

export async function testGitDiff(browser: Browser, api: Diagnostics, artifact: string, record: (text: string) => void) {
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'nested folder/nested.md');
  const page = browser.contexts().flatMap(context => context.pages())[0];
  const initialViewport = page.viewportSize() ?? await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const comparison = async () => until(async () => {
    for (const p of browser.contexts().flatMap(context => context.pages())) for (const frame of p.frames()) {
      try { if (await frame.locator('.comparison-workspace').isVisible()) return frame; } catch { /* A closed comparison replaces its frame. */ }
    }
    return undefined;
  }, value => !!value, 'single comparison workspace') as Promise<Frame>;
  const sides = (frame: Frame) => ({
    original: frame.locator('.comparison-side[data-comparison-side=original]'),
    modified: frame.locator('.comparison-side[data-comparison-side=modified]'),
  });
  const assertSingleComparison = async () => {
    await until(() => api.getOpenDocuments(), docs => docs.filter(item => item.visible && item.ready && item.comparison).length === 1, 'one native comparison session');
    const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
    assert.equal(tabs.length, 1, 'One Git comparison must own one tab, including its original revision');
    assert.equal(vscode.window.tabGroups.all.length, 1, 'Opening a Git comparison must not split the workbench into new editor groups');
    assert.ok(tabs[0].input instanceof vscode.TabInputCustom);
    assert.equal(tabs[0].input.viewType, 'parsiword.markdown.diff');
  };
  const setEnglish = async (frame: Frame) => {
    const toolbarLanguage = frame.getByRole('button', { name: 'English', exact: true });
    if (await toolbarLanguage.count()) { await toolbarLanguage.first().click(); return; }
    const language = frame.getByRole('link', { name: 'English', exact: true });
    if (await language.count()) await language.first().click();
  };
  const control = (frame: Frame, name: string) => frame.locator('.comparison-toolbar').getByLabel(name, { exact: true });
  const setMode = async (frame: Frame, view: 'source' | 'rendered', layout: 'side-by-side' | 'inline') => {
    await control(frame, view === 'source' ? 'Markdown source' : 'Rendered result').click();
    await control(frame, layout === 'side-by-side' ? 'Side by side' : 'Inline').click();
    await expect(frame.locator('.comparison-workspace')).toHaveAttribute('data-view', view);
    await expect(frame.locator('.comparison-workspace')).toHaveAttribute('data-layout', layout);
  };
  const assertAligned = async (frame: Frame, view: 'source' | 'rendered') => {
    const { original, modified } = sides(frame);
    await original.evaluate(element => { element.scrollTop = 0; });
    await modified.evaluate(element => { element.scrollTop = 0; });
    const textSelector = view === 'source' ? '.markdown-source-highlight [data-source-line="0"]' : '.rich-document > h1';
    const toolbarSelector = view === 'source' ? '.format-toolbar' : '.rich-toolbar-container';
    await expect(original.locator(textSelector)).toBeVisible();
    await expect(modified.locator(textSelector)).toBeVisible();
    await expect.poll(async () => {
      const [beforeText, afterText] = await Promise.all([original.locator(textSelector).boundingBox(), modified.locator(textSelector).boundingBox()]);
      return beforeText && afterText ? Math.abs(beforeText.y - afterText.y) : Infinity;
    }, { message: `${view} original and modified text must start at the same vertical position` }).toBeLessThanOrEqual(1);
    const beforeToolbar = await original.locator(toolbarSelector).boundingBox(), afterToolbar = await modified.locator(toolbarSelector).boundingBox();
    assert.ok(beforeToolbar && afterToolbar && Math.abs(beforeToolbar.height - afterToolbar.height) <= 1, `${view} original and modified toolbar heights differ: ${JSON.stringify({ beforeToolbar, afterToolbar })}`);
    const heading = frame.locator('.comparison-document-controls .document-host-controls');
    await expect(heading).toHaveCount(1); await expect(heading).toBeVisible();
    await expect(frame.locator('.document-name, .document-tools, [id^=document-title]')).toHaveCount(0);
    const shared = await heading.boundingBox(), revision = await original.locator('.comparison-revision').boundingBox();
    assert.ok(shared && revision && shared.y + shared.height <= revision.y + 1, 'The single document header must sit above both revision columns');
  };
  const workbench = vscode.workspace.getConfiguration('workbench');
  const previousTheme = workbench.inspect('colorTheme')?.workspaceValue;
  const previousAssociations = workbench.inspect('editorAssociations')?.workspaceValue;
  try {
    // Keep an unrelated native undo stack alive. History must follow the
    // modified TextDocument even after the original side or a picker had focus.
    const decoyUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'other.md');
    const decoy = await vscode.workspace.openTextDocument(decoyUri);
    const nativeEditor = await vscode.window.showTextDocument(decoy);
    await nativeEditor.edit(edit => edit.insert(new vscode.Position(0, 0), '<!-- unrelated history -->\n'));
    await decoy.save();
    const decoyText = decoy.getText();
    await vscode.commands.executeCommand('workbench.action.closeAuxiliaryBar');
    await vscode.commands.executeCommand('workbench.action.closeSidebar');
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('workbench.action.editorLayoutSingle');
    await workbench.update('editorAssociations', { '*.md': 'parsiword.markdown' }, vscode.ConfigurationTarget.Workspace);
    const gitExtension = await vscode.extensions.getExtension<{ getAPI(version: number): { repositories: { rootUri: vscode.Uri; status(): Promise<void>; state: { workingTreeChanges: { uri: vscode.Uri }[] } }[] } }>('vscode.git')!.activate();
    const repository = await until(() => gitExtension.getAPI(1).repositories.find(repository => uri.fsPath.startsWith(repository.rootUri.fsPath)), value => !!value, 'fixture Git repository registered');
    await repository!.status();
    await until(() => repository!.state.workingTreeChanges, changes => changes.some(change => change.uri.toString() === uri.toString()), 'fixture working-tree change discovered');
    await vscode.commands.executeCommand('git.refresh');
    await vscode.commands.executeCommand('git.openChange', uri);
    let frame = await comparison();
    await assertSingleComparison();
    await setEnglish(frame);
    let { original, modified } = sides(frame);
    await setMode(frame, 'source', 'side-by-side');
    const doc = await vscode.workspace.openTextDocument(uri);
    const before = doc.getText(), revision = await original.locator('.markdown-editor').inputValue();
    await expect(original.locator('.markdown-editor')).toHaveAttribute('readonly', '');
    await expect(original.locator('.rich-document')).toHaveAttribute('contenteditable', 'false');
    await expect(modified.locator('.markdown-editor')).not.toHaveAttribute('readonly', '');
    await expect(original.locator('.markdown-editor')).toHaveValue(/STAGED/);
    await expect(modified.locator('.markdown-editor')).toHaveValue(/WORKING/);
    await expect(original.locator('.markdown-source-highlight [data-source-line][data-diff=delete]').first()).toBeVisible();
    await expect(modified.locator('.markdown-source-highlight [data-source-line][data-diff=insert]').first()).toBeVisible();
    await expect(original.locator('[data-diff-word=delete]').first()).toBeVisible();
    await expect(modified.locator('[data-diff-word=insert]').first()).toBeVisible();
    const left = await original.boundingBox(), right = await modified.boundingBox();
    assert.ok(left && right && Math.abs(left.x - right.x) > Math.min(left.width, right.width) / 2, 'Side-by-side revisions must occupy distinct horizontal columns');
    await assertAligned(frame, 'source');
    const divider = frame.getByRole('separator', { name: 'Resize comparison panes', exact: true });
    await expect(divider).toBeVisible();
    const dividerBox = await divider.boundingBox(); assert.ok(dividerBox && left);
    const center = { x: dividerBox.x + dividerBox.width / 2, y: dividerBox.y + Math.min(dividerBox.height / 2, 120) };
    await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + 90, center.y, { steps: 8 }); await page.mouse.up();
    await expect.poll(async () => Math.abs((await original.boundingBox())!.width - left.width)).toBeGreaterThan(40);
    const draggedWidth = (await original.boundingBox())!.width;
    await divider.focus(); await divider.press('ArrowLeft');
    await expect.poll(async () => Math.abs((await original.boundingBox())!.width - draggedWidth)).toBeGreaterThan(1);
    const resetDivider = await divider.boundingBox(); assert.ok(resetDivider);
    await page.mouse.move(resetDivider.x + resetDivider.width / 2, center.y); await page.mouse.down(); await page.mouse.move(center.x, center.y, { steps: 8 }); await page.mouse.up();
    await assertAligned(frame, 'source');
    await page.screenshot({ path: join(artifact, 'git-diff-source.png') });
    record('Source Control opens one ParsiWord comparison tab with both RTL revisions, red/green lines and changed words');
    record('One shared document header aligns both source text starts; the comparison divider resizes with mouse and keyboard');

    const directionControls = frame.locator('.comparison-document-controls .comparison-direction-controls');
    const previousToolbarDirection = (await directionControls.locator('[data-state=on]').textContent())!.trim();
    for (const format of ['Word', 'PDF']) {
      const button = frame.locator('.comparison-document-controls').getByRole('button', { name: `Save ${format} file`, exact: true });
      await expect(button).toBeVisible();
      await expect(button).toHaveText(format);
      const box = await button.boundingBox();
      const rem = await frame.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
      assert.ok(box && box.width <= 4 * rem, `${format} export must remain a compact toolbar action`);
    }
    for (const view of ['source', 'rendered'] as const) for (const layout of ['side-by-side', 'inline'] as const) {
      await setMode(frame, view, layout);
      for (const [label, direction] of [['RTL', 'rtl'], ['LTR', 'ltr'], ['Auto', 'auto']] as const) {
        await directionControls.getByText(label, { exact: true }).click();
        await expect(directionControls.getByText(label, { exact: true })).toHaveAttribute('data-state', 'on');
        const documents = layout === 'inline'
          ? frame.locator(view === 'source' ? '.comparison-inline .comparison-source' : '.comparison-inline .rich-document')
          : frame.locator(view === 'source' ? '.comparison-side .markdown-editor' : '.comparison-side .rich-document');
        assert.ok(await documents.count() >= 2, 'Direction check must cover both comparison revisions');
        await expect.poll(() => documents.evaluateAll(elements => elements.map(element => element.getAttribute('dir')))).toEqual(Array(await documents.count()).fill(direction));
        if (view === 'source') {
          await expect.poll(() => documents.evaluateAll(elements => elements.every(element => getComputedStyle(element).unicodeBidi === (element.getAttribute('dir') === 'auto' ? 'plaintext' : 'normal')))).toBe(true);
          if (layout === 'side-by-side') {
            const mirrors = frame.locator('.comparison-side .markdown-source-highlight');
            await expect.poll(() => mirrors.evaluateAll((elements, direction) => elements.every(element => element.getAttribute('dir') === direction), direction)).toBe(true);
            await expect.poll(() => mirrors.locator('[data-source-line]').evaluateAll((elements, direction) => elements.every(element => getComputedStyle(element).unicodeBidi === (direction === 'auto' ? 'plaintext' : 'normal')), direction)).toBe(true);
          }
        }
        assert.equal(doc.getText(), before, 'Changing direction must not rewrite the native Markdown document');
      }
    }
    await directionControls.getByText(previousToolbarDirection, { exact: true }).click();
    await setMode(frame, 'source', 'side-by-side');
    await expect(original.locator('.markdown-editor')).toHaveValue(revision);
    await expect(modified.locator('.markdown-editor')).toHaveValue(before);
    await control(frame, 'فارسی').click();
    await page.screenshot({ path: join(artifact, 'git-diff-direction-toolbar-fa.png') });
    await setEnglish(frame);
    record('Visible RTL/LTR/Auto controls update both source and rendered revisions in side-by-side and inline layouts without rewriting Markdown; Word/PDF are compact direct actions');

    const originalSource = original.locator('.markdown-editor');
    await originalSource.click(); await originalSource.press('Control+h');
    await expect(original.locator('[id^=editor-find-query]')).toBeFocused();
    await original.locator('[id^=editor-find-query]').fill('STAGED');
    await expect(original.locator('.search-count')).not.toHaveText('No results');
    await expect(original.locator('[id^=editor-replace-text]')).toBeDisabled();
    await original.locator('[id^=editor-find-query]').press('Escape');
    await originalSource.press('Control+a'); await originalSource.press('Control+x'); await originalSource.press('Control+v'); await originalSource.press('Control+z');
    await expect(originalSource).toHaveValue(revision);
    assert.equal(doc.getText(), before);
    const modifiedSource = modified.locator('.markdown-editor');
    await modifiedSource.click(); await modifiedSource.press('Control+h');
    await modified.locator('[id^=editor-find-query]').fill('WORKING');
    await modified.locator('[id^=editor-replace-text]').fill('SEARCH_REPLACED');
    await modified.getByRole('button', { name: 'Replace', exact: true }).click();
    await until(() => doc.getText(), text => text === before.replace('WORKING', 'SEARCH_REPLACED'), 'replacement in modified comparison');
    await modified.locator('[id^=editor-find-query]').press('Escape'); await modifiedSource.press('Control+z');
    await until(() => doc.getText(), text => text === before, 'comparison replacement undo');
    await expect(modifiedSource).toHaveValue(before);
    record('Search and replacement target the focused side in one webview; the original stays read-only and modified replacement has native Undo');

    let historyReason: vscode.TextDocumentChangeReason | undefined;
    const history = vscode.workspace.onDidChangeTextDocument(event => { if (event.document === doc && event.contentChanges.length) historyReason = event.reason; });
    const next = before.replace('WORKING', 'EDITED_FROM_DIFF');
    await modifiedSource.fill(next);
    await until(() => doc.getText(), text => text === next, 'comparison edit updates native document');
    await expect(originalSource).toHaveValue(revision);
    await expect(modified.locator('[data-diff-word=insert]').filter({ hasText: 'EDITED_FROM_DIFF' })).toBeVisible();
    await modifiedSource.press('Control+z');
    await until(() => doc.getText(), text => text === before, 'undo in comparison');
    assert.equal(historyReason, vscode.TextDocumentChangeReason.Undo, 'Comparison Undo must use the target TextDocument history, not browser history');
    assert.equal(decoy.getText(), decoyText, 'Comparison Undo modified an unrelated native document');
    await modifiedSource.press('Control+Shift+z');
    await until(() => doc.getText(), text => text === next, 'redo in comparison');
    assert.equal(historyReason, vscode.TextDocumentChangeReason.Redo);
    await modifiedSource.press('Control+s'); await until(() => doc.isDirty, dirty => !dirty, 'save in comparison');
    assert.equal(await readFile(uri.fsPath, 'utf8'), next);
    history.dispose();
    record('The unified comparison preserves exact native Undo/Redo reasons, Save bytes and unrelated editor history');

    await modifiedSource.fill(`${next}BUTTONEDIT`);
    await until(() => doc.getText(), text => text === `${next}BUTTONEDIT`, 'shared header history fixture');
    await originalSource.click();
    await frame.locator('.comparison-toolbar').getByRole('button', { name: 'Undo', exact: true }).click();
    await until(() => doc.getText(), text => text === next, 'shared header Undo after original-side focus');
    await frame.locator('.comparison-toolbar').getByRole('button', { name: 'Redo', exact: true }).click();
    await until(() => doc.getText(), text => text === `${next}BUTTONEDIT`, 'shared header Redo');
    await frame.locator('.comparison-toolbar').getByRole('button', { name: 'Undo', exact: true }).click();
    await until(() => doc.getText(), text => text === next, 'shared header restore');
    await frame.locator('.comparison-toolbar').getByRole('button', { name: 'Save', exact: true }).click();
    await until(() => doc.isDirty, dirty => !dirty, 'shared header Save');
    assert.equal(await readFile(uri.fsPath, 'utf8'), next);
    assert.equal(decoy.getText(), decoyText);
    record('Shared header Undo/Redo/Save still target the modified document after the read-only original had focus');

    const position = frame.locator('[data-comparison-position]');
    const firstPosition = await position.textContent();
    assert.ok(Number(firstPosition?.split('/')[1].trim()) >= 2, 'Fixture needs separate replacement and insertion changes for navigation');
    await control(frame, 'Next change').click();
    await expect(position).not.toHaveText(firstPosition ?? '');
    await control(frame, 'Previous change').click();
    await expect(position).toHaveText(firstPosition ?? '');
    assert.equal(doc.getText(), next);
    record('Shared previous/next change controls navigate without modifying either revision');

    await originalSource.click(); await originalSource.press('Control+f');
    await original.locator('[id^=editor-find-query]').fill('STAGED');
    await modifiedSource.click(); await modifiedSource.press('Control+f');
    await modified.locator('[id^=editor-find-query]').fill('EDITED_FROM_DIFF');
    await expect.poll(() => frame.evaluate(() => [...(CSS.highlights.get('parsiword-find-original') ?? [])].map(range => range.toString()))).toEqual(['STAGED']);
    await expect.poll(() => frame.evaluate(() => [...(CSS.highlights.get('parsiword-find-modified') ?? [])].map(range => range.toString()))).toEqual(['EDITED_FROM_DIFF']);
    await original.locator('[id^=editor-find-query]').press('Escape');
    await expect.poll(() => frame.evaluate(() => [...(CSS.highlights.get('parsiword-find-modified') ?? [])].map(range => range.toString()))).toEqual(['EDITED_FROM_DIFF']);
    await setMode(frame, 'rendered', 'side-by-side');
    await expect(modified.locator('[id^=editor-find-query]')).toHaveCount(0);
    await expect(modified.locator('.rich-document')).toBeVisible();
    assert.equal(doc.getText(), next);
    record('Both revision searches keep independent highlights; switching source to rendered closes the hidden source search');

    for (const layout of ['side-by-side', 'inline'] as const) {
      await setMode(frame, 'rendered', layout);
      const review = layout === 'inline' ? frame.locator('.comparison-inline') : frame.locator('.comparison-side .rich-document');
      if (layout === 'side-by-side') {
        await assertAligned(frame, 'rendered');
        await expect(original.locator('.rich-toolbar-container')).toHaveAttribute('disabled', '');
        record('Read-only and editable rendered toolbars have equal height and align both revision text starts');
      }
      await expect(review.locator('[data-diff=delete]').filter({ hasText: 'STAGED' }).first()).toBeVisible();
      await expect(review.locator('[data-diff=insert]').filter({ hasText: 'EDITED_FROM_DIFF' }).first()).toBeVisible();
      if (layout === 'inline') {
        await expect(review).toBeVisible();
        assert.equal(await review.locator('textarea:not([readonly]),[contenteditable=true]').count(), 0, 'Unified review must keep historical deleted text read-only');
        const ordered = await review.locator('[data-diff]').evaluateAll(elements => elements.map(element => ({ kind: element.getAttribute('data-diff'), text: element.textContent })));
        const deleted = ordered.findIndex(item => item.kind === 'delete' && item.text?.includes('STAGED'));
        const inserted = ordered.findIndex(item => item.kind === 'insert' && item.text?.includes('EDITED_FROM_DIFF'));
        assert.ok(deleted >= 0 && inserted > deleted, 'Unified inline must show the removed block before its inserted replacement');
        for (const [kind, text] of [['delete', 'STAGED'], ['insert', 'EDITED_FROM_DIFF']] as const) {
          const fragment = review.locator(`.comparison-part[data-diff=${kind}] .rich-document`).filter({ hasText: text });
          await expect(fragment).toHaveCount(1);
          await expect(fragment.locator(':scope > p')).toHaveCount(1);
          const heightRem = await fragment.evaluate(element => element.getBoundingClientRect().height / parseFloat(getComputedStyle(document.documentElement).fontSize));
          assert.ok(heightRem > 0 && heightRem < 6, `A single inline ${kind} paragraph must have compact natural height, got ${heightRem}rem`);
        }
        record('Rendered inline added and removed paragraphs keep a compact natural height without the full-editor minimum height');
        await expect(modified).toBeHidden();
        const previous = await position.textContent();
        await control(frame, 'Next change').click(); await expect(position).not.toHaveText(previous ?? '');
        await control(frame, 'Previous change').click(); await expect(position).toHaveText(previous ?? '');
      } else await expect(modified.locator('.rich-document')).toHaveAttribute('contenteditable', 'true');
      assert.equal(doc.getText(), next, 'Rendered/layout switching must not serialize or rewrite Markdown');
      await page.screenshot({ path: join(artifact, `git-diff-preview-${layout}.png`) });
      record(`Rendered ${layout} comparison visibly includes removed and added RTL content without changing Markdown`);
      await setMode(frame, 'source', layout);
      const sourceReview = layout === 'inline' ? frame.locator('.comparison-inline') : frame.locator('.comparison-side .markdown-source-highlight');
      await expect(sourceReview.locator('[data-diff=delete]').filter({ hasText: 'STAGED' }).first()).toBeVisible();
      await expect(sourceReview.locator('[data-diff=insert]').filter({ hasText: 'EDITED_FROM_DIFF' }).first()).toBeVisible();
      await expect(modified.locator('.markdown-editor')).toHaveValue(next);
      if (layout === 'inline') {
        const ordered = await sourceReview.locator('[data-diff]').evaluateAll(elements => elements.map(element => ({ kind: element.getAttribute('data-diff'), text: element.textContent })));
        const deleted = ordered.findIndex(item => item.kind === 'delete' && item.text?.includes('STAGED'));
        const inserted = ordered.findIndex(item => item.kind === 'insert' && item.text?.includes('EDITED_FROM_DIFF'));
        assert.ok(deleted >= 0 && inserted > deleted, 'Unified source inline must show the removed line before its inserted replacement');
        for (const [kind, marker, source] of [['delete', 'STAGED', revision], ['insert', 'EDITED_FROM_DIFF', next]] as const) {
          const fragment = sourceReview.locator(`.comparison-part[data-diff=${kind}] .comparison-source`).filter({ hasText: marker });
          await expect(fragment).toHaveCount(1);
          const expected = `${source.split('\n').find(line => line.includes(marker))}\n`;
          assert.equal(await fragment.textContent(), expected, `Inline ${kind} must retain the exact source line and its newline`);
          const size = await fragment.evaluate(element => {
            const style = getComputedStyle(element);
            return { height: element.getBoundingClientRect().height, lineHeight: parseFloat(style.lineHeight), paddingTop: parseFloat(style.paddingTop), paddingBottom: parseFloat(style.paddingBottom) };
          });
          assert.ok(size.height > 0 && size.height <= size.lineHeight + size.paddingTop + size.paddingBottom + 1,
            `A single inline source ${kind} line must occupy one text row with its padding: ${JSON.stringify(size)}`);
        }
        record('Source inline added and removed lines occupy one natural text row and retain their exact Markdown/newline text');
      }
      assert.equal(doc.getText(), next);
      await page.screenshot({ path: join(artifact, `git-diff-source-${layout}.png`) });
      record(`Markdown source ${layout} comparison keeps deletion/addition highlights and the same editable native document`);
    }

    await setMode(frame, 'rendered', 'side-by-side');
    const settingsButton = frame.locator('.comparison-document-controls').getByRole('button', { name: 'Export settings', exact: true });
    await settingsButton.click();
    const settingsDialog = frame.getByRole('dialog');
    await expect(settingsDialog).toBeVisible();
    const directionGroup = settingsDialog.getByLabel('Export text direction', { exact: true });
    const sizeGroup = settingsDialog.getByLabel('Text size', { exact: true });
    const previousDirection = (await directionGroup.locator('[data-state=on]').textContent())!.trim();
    const previousSize = (await sizeGroup.locator('[data-state=on]').textContent())!.trim();
    await directionGroup.getByText('Left to right', { exact: true }).click();
    await sizeGroup.getByText('18 pt', { exact: true }).click();
    await settingsDialog.getByRole('button', { name: 'Done', exact: true }).click();
    for (const side of [original, modified]) {
      await expect(side.locator('.rich-document')).toHaveAttribute('dir', 'ltr');
      await expect.poll(() => side.locator('.rich-document').evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(20);
    }
    await setMode(frame, 'rendered', 'inline');
    const fragments = frame.locator('.comparison-inline .rich-document');
    assert.ok(await fragments.count() >= 2, 'Inline rendered settings check needs removed and inserted fragments');
    await expect.poll(() => fragments.evaluateAll(elements => elements.every(element => element.getAttribute('dir') === 'ltr' && parseFloat(getComputedStyle(element).fontSize) === 20))).toBe(true);
    await settingsButton.click();
    await directionGroup.getByText(previousDirection, { exact: true }).click();
    await sizeGroup.getByText(previousSize, { exact: true }).click();
    await settingsDialog.getByRole('button', { name: 'Done', exact: true }).click();
    assert.equal(doc.getText(), next, 'Shared display settings must not rewrite Markdown');
    await expect(original.locator('.markdown-editor')).toHaveValue(revision);
    record('One shared settings dialog updates text direction and font size on both rendered sides and every inline fragment without changing Markdown');

    for (const view of ['source', 'rendered'] as const) {
      await setMode(frame, view, 'inline');
      await control(frame, 'Edit current version').click();
      await expect(frame.locator('.comparison-inline')).toBeHidden();
      await expect(modified).toBeVisible();
      const input = view === 'source' ? modified.locator('.markdown-editor') : modified.locator('.rich-document');
      if (!await input.isVisible()) console.log('Inline editing geometry', JSON.stringify(await frame.evaluate(() => ({
        viewport: { width: innerWidth, height: innerHeight, x: scrollX, y: scrollY },
        nodes: [...document.querySelectorAll('.comparison-workspace, .comparison-editors, [data-comparison-panel], .comparison-side, .comparison-side[data-comparison-side=modified] .rich-document')].map(element => ({
          className: element.className, attributes: element.getAttributeNames().reduce((values, name) => ({ ...values, [name]: element.getAttribute(name) }), {}),
          rect: element.getBoundingClientRect().toJSON(), display: getComputedStyle(element).display, flex: getComputedStyle(element).flex,
        })),
      }))));
      if (view === 'rendered') await input.locator('p').filter({ hasText: 'English paragraph 24' }).click();
      else await input.click();
      await expect(frame.getByRole('dialog')).toHaveCount(0);
      await expect(input).toBeFocused();
      await input.press('Control+End');
      // Insert one native input transaction; clipboard behavior has its own suite.
      await page.keyboard.insertText('INLINEEDIT');
      await until(() => doc.getText(), text => text.includes('INLINEEDIT'), `inline ${view} modified version edit`);
      await input.press('Control+z'); await until(() => doc.getText(), text => text === next, `inline ${view} native Undo`);
      await control(frame, 'Review changes').click();
      await expect(frame.locator('.comparison-inline')).toBeVisible();
      await expect(frame.locator('.comparison-inline')).not.toContainText('INLINEEDIT');
      await assertSingleComparison();
      record(`Inline ${view} review edits the current version inside the same tab and returns with exact native Undo`);
      await frame.locator('.comparison-inline [data-diff=insert]').filter({ hasText: 'EDITED_FROM_DIFF' }).first().click();
      await page.keyboard.press('Control+f');
      const inlineQuery = modified.locator('[id^=editor-find-query]');
      await expect(inlineQuery).toBeFocused(); await inlineQuery.fill('EDITED_FROM_DIFF');
      await expect(modified.locator('.search-count')).not.toHaveText('No results');
      await expect(modified).toBeVisible();
      await inlineQuery.press('Escape'); await control(frame, 'Review changes').click();
      await expect(frame.locator('.comparison-inline')).toBeVisible();
      assert.equal(doc.getText(), next);
      record(`Ctrl+F from ${view} inline review opens a visible current-version search in the same tab`);
    }

    await setMode(frame, 'rendered', 'side-by-side');
    for (const side of [original, modified]) {
      const image = side.locator('.rich-markdown-image img[alt="شرح تصویر"]');
      await expect(image).toHaveCount(1);
      if (!await image.isVisible()) console.log('Image diagnostics', JSON.stringify(await image.evaluate((element: HTMLImageElement) => ({
        src: element.src, complete: element.complete, naturalWidth: element.naturalWidth, naturalHeight: element.naturalHeight,
        ancestors: [element, element.parentElement!, element.closest('.rich-markdown-image')!].map(node => ({
          tag: node.tagName, className: node.className, rect: node.getBoundingClientRect().toJSON(), display: getComputedStyle(node).display,
          width: getComputedStyle(node).width, height: getComputedStyle(node).height,
        })),
      }))));
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
      assert.match(await image.getAttribute('src') ?? '', /vscode-(?:resource|webview)/);
    }
    assert.equal(doc.getText(), next, 'Loading Markdown image resources must not rewrite source');
    await page.screenshot({ path: join(artifact, 'git-diff-images.png') });
    record('Relative Markdown images load as actual webview resources on both comparison sides without changing Markdown');
    const previousViewport = page.viewportSize() ?? await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    try {
      await page.setViewportSize({ width: 380, height: 900 });
      for (let attempt = 0; attempt < 3; attempt++) {
        const width = await frame.evaluate(() => innerWidth);
        if (Math.abs(width - 320) <= 1) break;
        const outer = await page.evaluate(() => innerWidth);
        await page.setViewportSize({ width: Math.max(320, outer + 320 - width), height: 900 });
        await wait(100);
      }
      for (const locale of ['en', 'fa'] as const) {
        if (locale === 'fa') await frame.getByRole('button', { name: 'فارسی', exact: true }).click();
        for (const view of ['source', 'rendered'] as const) {
          await setMode(frame, view, 'side-by-side');
          const size = await frame.evaluate(() => ({ width: innerWidth, page: document.documentElement.scrollWidth, workspace: document.querySelector('.comparison-workspace')!.scrollWidth }));
          assert.ok(Math.abs(size.width - 320) <= 1, `Expected an actual narrow 320 webview, got ${JSON.stringify(size)}`);
          if (size.page > size.width + 1 || size.workspace > size.width + 1) {
            const overflow = await frame.evaluate(() => [...document.querySelectorAll<HTMLElement>('.comparison-workspace *')].map(element => {
              const rect = element.getBoundingClientRect();
              return { tag: element.tagName, class: element.className, slot: element.dataset.slot, text: element.textContent?.slice(0, 100), left: rect.left, right: rect.right, width: rect.width, scroll: element.scrollWidth, minWidth: getComputedStyle(element).minWidth };
            }).filter(element => element.left < -1 || element.right > innerWidth + 1).slice(0, 80));
            await writeFile(join(artifact, 'git-diff-narrow-failure.json'), JSON.stringify({ locale, view, size, overflow }, null, 2));
            await page.screenshot({ path: join(artifact, 'git-diff-narrow-failure.png') });
          }
          assert.ok(size.page <= size.width + 1 && size.workspace <= size.width + 1, `${view} comparison overflows the narrow webview: ${JSON.stringify(size)}`);
          const clippedControls = await frame.locator('.comparison-document-controls button').evaluateAll(buttons => buttons.map(button => {
            const rect = button.getBoundingClientRect();
            return { name: button.getAttribute('aria-label') ?? button.textContent, left: rect.left, right: rect.right };
          }).filter(button => button.left < -1 || button.right > innerWidth + 1));
          assert.deepEqual(clippedControls, [], `${locale} ${view} shared controls must remain inside the webview`);
          await expect(original.locator('.markdown-editor')).toHaveValue(revision);
          await expect(modified.locator('.markdown-editor')).toHaveValue(next);
        }
      }
      await page.screenshot({ path: join(artifact, 'git-diff-narrow.png') });
      await setEnglish(frame);
      assert.equal(doc.getText(), next);
      record('English and Persian source/rendered comparisons fit an actual 320-wide VS Code webview with all shared controls visible and no document changes');
    } finally { await page.setViewportSize(previousViewport); }
    await setMode(frame, 'rendered', 'side-by-side');
    const rich = modified.locator('.rich-document');
    // A centre click on this long document can hit the SVG atomic block and
    // open its markup dialog, especially after restoring a CI-sized viewport.
    // Exercise native editor history from a real text paragraph instead.
    await rich.locator('p').filter({ hasText: 'English paragraph 24' }).click();
    await expect(frame.getByRole('dialog')).toHaveCount(0);
    await expect(rich).toBeFocused();
    await rich.press('Control+End');
    await page.keyboard.insertText('RICHDIFF');
    await until(() => doc.getText(), text => text.includes('RICHDIFF'), 'rendered edit in unified comparison');
    await expect(original.locator('.rich-document')).not.toContainText('RICHDIFF');
    await rich.press('Control+z'); await until(() => doc.getText(), text => text === next, 'rendered comparison native undo');
    await expect(rich).not.toContainText('RICHDIFF');
    record('Rendered comparison editing shares the modified TextDocument history and restores exact Markdown with Undo');

    await workbench.update('colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Workspace);
    await expect(page.locator('.monaco-workbench')).toHaveClass(/vs-dark/);
    await setMode(frame, 'source', 'side-by-side');
    const color = await modified.locator('.markdown-source-highlight [data-source-line][data-diff=insert]').first().evaluate(element => getComputedStyle(element).backgroundColor);
    assert.notEqual(color, 'rgba(0, 0, 0, 0)');
    await page.screenshot({ path: join(artifact, 'git-diff-dark.png') });
    record('Comparison source and rendered controls retain visible diff backgrounds in the dark VS Code theme');

    await vscode.commands.executeCommand('workbench.action.webview.reloadWebviewAction');
    await frame.locator('.comparison-workspace').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    frame = await comparison(); await assertSingleComparison(); await setEnglish(frame);
    ({ original, modified } = sides(frame));
    await setMode(frame, 'source', 'side-by-side');
    await expect(original.locator('.markdown-editor')).toHaveValue(revision);
    await expect(modified.locator('.markdown-editor')).toHaveValue(next);
    const reloadedSource = modified.locator('.markdown-editor');
    await reloadedSource.click(); await reloadedSource.press('Control+End');
    await page.keyboard.insertText('AFTERRELOAD');
    await until(() => doc.getText(), text => text.includes('AFTERRELOAD'), 'reloaded comparison native edit');
    await reloadedSource.press('Control+z'); await until(() => doc.getText(), text => text === next, 'reloaded comparison native Undo');
    record('Reloading the comparison webview restores both revision identities, one tab and the modified native history');

    // Unequal line counts and unequal pane widths make equal scroll percentages
    // visibly wrong. Both directions must preserve a common content anchor.
    // Exercise the actual Windows CI desktop geometry on larger local screens.
    // Its narrower paragraphs wrap differently from a maximized developer IDE.
    await page.setViewportSize({ width: 1024, height: 768 });
    await setMode(frame, 'source', 'side-by-side');
    const scrollDivider = frame.getByRole('separator', { name: 'Resize comparison panes', exact: true });
    const scrollDividerBox = await scrollDivider.boundingBox(); assert.ok(scrollDividerBox);
    await page.mouse.move(scrollDividerBox.x + scrollDividerBox.width / 2, scrollDividerBox.y + 120);
    await page.mouse.down(); await page.mouse.move(scrollDividerBox.x + 90, scrollDividerBox.y + 120, { steps: 8 }); await page.mouse.up();
    for (const view of ['source', 'rendered'] as const) {
      await setMode(frame, view, 'side-by-side');
      const toolbarSelector = view === 'source' ? '.format-toolbar' : '.rich-toolbar-container';
      const toolbars = [original.locator(toolbarSelector), modified.locator(toolbarSelector)];
      await Promise.all(toolbars.map(toolbar => expect(toolbar).toBeVisible()));
      await expect.poll(async () => {
        const boxes = await Promise.all(toolbars.map(toolbar => toolbar.boundingBox()));
        return boxes[0] && boxes[1] && boxes.every(box => box && box.height > 0)
          ? Math.abs(boxes[0].height - boxes[1].height) : Infinity;
      }, { message: `${view} toolbar containers must reserve equal height despite different wrapping` }).toBeLessThanOrEqual(1);
      const toolbarGeometry = await Promise.all([original, modified].map(side => side.evaluate((element, selector) => {
        const toolbar = element.querySelector<HTMLElement>(selector)!;
        const row = toolbar.querySelector<HTMLElement>('.rich-format-toolbar') ?? toolbar;
        return { paneWidth: element.getBoundingClientRect().width, top: toolbar.getBoundingClientRect().top,
          bottom: toolbar.getBoundingClientRect().bottom, height: toolbar.getBoundingClientRect().height,
          scrollWidth: row.scrollWidth, clientWidth: row.clientWidth };
      }, toolbarSelector)));
      if (view === 'rendered') {
        const narrower = toolbarGeometry.reduce((a, b) => a.paneWidth < b.paneWidth ? a : b);
        assert.ok(narrower.scrollWidth > narrower.clientWidth + 1, 'The narrower rendered formatting row must actually overflow to exercise scrollbar gutter alignment');
      }
      console.log('Scroll synchronization toolbar geometry', JSON.stringify({ view, toolbars: toolbarGeometry }));
      for (const [driver, follower, heading] of [[original, modified, 'بخش اسکرول 12'], [modified, original, 'بخش اسکرول 20']] as const) {
        const selector = view === 'source' ? '.markdown-source-highlight [data-source-line]' : '.rich-document > h2';
        const anchor = driver.locator(selector).filter({ hasText: heading }).first();
        const peerAnchor = follower.locator(selector).filter({ hasText: heading }).first();
        await expect(anchor).toHaveCount(1); await expect(peerAnchor).toHaveCount(1);
        const anchorBox = await anchor.boundingBox(), sideBox = await driver.boundingBox(); assert.ok(anchorBox && sideBox);
        const readingOffset = await driver.evaluate(element => {
          const top = element.getBoundingClientRect().top;
          return Math.max(0, ...[...element.querySelectorAll('.comparison-revision, .format-toolbar, .rich-toolbar-container, .editor-search')]
            .map(toolbar => toolbar.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0).map(rect => rect.bottom - top));
        });
        // Compare the content at the reading edge. Differently wrapped
        // paragraphs farther below it legitimately occupy different heights.
        const targetOffset = readingOffset + 2;
        const destination = await driver.evaluate((element, distance) => { element.scrollTop += distance; return element.scrollTop; }, anchorBox.y - sideBox.y - targetOffset);
        assert.ok(destination > 100, `The ${view} fixture must actually scroll`);
        await wait(100);
        console.log('Scroll synchronization geometry', JSON.stringify({ view, heading, targetOffset,
          original: await original.evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight, client: element.clientHeight, rect: element.getBoundingClientRect().toJSON() })),
          modified: await modified.evaluate(element => ({ top: element.scrollTop, height: element.scrollHeight, client: element.clientHeight, rect: element.getBoundingClientRect().toJSON() })),
          active: await anchor.boundingBox(), passive: await peerAnchor.boundingBox(),
          blocks: await Promise.all([anchor, peerAnchor].map(item => item.evaluate(element => {
            const siblings = element.parentElement ? [...element.parentElement.children] : [];
            const index = siblings.indexOf(element);
            return siblings.slice(Math.max(0, index - 2), index + 2).map(block => ({
              tag: block.tagName, start: block.getAttribute('data-source-start'), end: block.getAttribute('data-source-end'),
              top: block.getBoundingClientRect().top, bottom: block.getBoundingClientRect().bottom,
            }));
          }))),
        }));
        await expect.poll(async () => {
          const [active, passive] = await Promise.all([anchor.boundingBox(), peerAnchor.boundingBox()]);
          return active && passive ? Math.abs(active.y - passive.y) : Infinity;
        }, { timeout: 10000, message: `Both ${view} scroll directions must align the common heading despite inserted lines and wrapping` }).toBeLessThanOrEqual(3);
        const settled = await Promise.all([driver.evaluate(element => element.scrollTop), follower.evaluate(element => element.scrollTop)]);
        assert.ok(settled.every(value => value > 100), `${view} peer pane did not scroll`);
        await wait(250);
        const later = await Promise.all([driver.evaluate(element => element.scrollTop), follower.evaluate(element => element.scrollTop)]);
        assert.ok(later.every((value, index) => Math.abs(value - settled[index]) <= 1), `${view} scroll synchronization did not settle`);
        console.log(`Scroll synchronization passed: ${view} ${heading}`);
      }
      assert.equal(doc.getText(), next);
      record(`Bidirectional ${view} scrolling aligns common content with inserted lines and different pane wrapping, without feedback loops`);
    }
    const changedDivider = await scrollDivider.boundingBox(); assert.ok(changedDivider);
    await page.mouse.move(changedDivider.x + changedDivider.width / 2, changedDivider.y + 120);
    await page.mouse.down(); await page.mouse.move(scrollDividerBox.x + scrollDividerBox.width / 2, changedDivider.y + 120, { steps: 8 }); await page.mouse.up();
    await original.evaluate(element => { element.scrollTop = 0; }); await modified.evaluate(element => { element.scrollTop = 0; });
    await page.setViewportSize(initialViewport);

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    await until(() => api.getOpenDocuments(), docs => !docs.some(item => item.visible && item.comparison), 'one close disposes the comparison');
    assert.equal(vscode.window.tabGroups.all.flatMap(group => group.tabs).length, 0);
    record('Closing one comparison tab closes both revisions and leaves no orphan editor group');

    await vscode.commands.executeCommand('parsiword.stagedDiff', uri);
    frame = await comparison(); await assertSingleComparison(); await setEnglish(frame);
    ({ original, modified } = sides(frame));
    await setMode(frame, 'source', 'side-by-side');
    await expect(original.locator('.markdown-editor')).toHaveValue(/ORIGINAL/);
    await expect(modified.locator('.markdown-editor')).toHaveValue(/STAGED/);
    for (const side of [original, modified]) {
      await expect(side.locator('.markdown-editor')).toHaveAttribute('readonly', '');
      await expect(side.locator('.rich-document')).toHaveAttribute('contenteditable', 'false');
    }
    await expect(original.locator('.markdown-source-highlight [data-diff=delete]').first()).toBeVisible();
    await expect(modified.locator('.markdown-source-highlight [data-diff=insert]').first()).toBeVisible();
    for (const layout of ['side-by-side', 'inline'] as const) {
      await setMode(frame, 'rendered', layout);
      const review = layout === 'inline' ? frame.locator('.comparison-inline') : frame.locator('.comparison-side .rich-document');
      await expect(review.locator('[data-diff=delete]').filter({ hasText: 'ORIGINAL' }).first()).toBeVisible();
      await expect(review.locator('[data-diff=insert]').filter({ hasText: 'STAGED' }).first()).toBeVisible();
      await setMode(frame, 'source', layout);
      const sourceReview = layout === 'inline' ? frame.locator('.comparison-inline') : frame.locator('.comparison-side .markdown-source-highlight');
      await expect(sourceReview.locator('[data-diff=delete]').filter({ hasText: 'ORIGINAL' }).first()).toBeVisible();
      await expect(sourceReview.locator('[data-diff=insert]').filter({ hasText: 'STAGED' }).first()).toBeVisible();
    }
    await page.screenshot({ path: join(artifact, 'git-diff-staged.png') });
    record('HEAD/index staged comparison is one tab, both revisions remain read-only in source and rendered layouts');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('parsiword.gitDiff', uri);
    frame = await comparison(); await assertSingleComparison(); await setEnglish(frame);
    ({ original, modified } = sides(frame));
    await setMode(frame, 'source', 'side-by-side');
    await expect(original.locator('.markdown-editor')).toHaveValue(/STAGED/);
    await expect(modified.locator('.markdown-editor')).toHaveValue(/EDITED_FROM_DIFF/);
    record('The ParsiWord Git diff command and Source Control use the same single-tab RTL comparison');

    const exactOriginal = vscode.window.tabGroups.all.flatMap(group => group.tabs).find(tab => tab.isActive);
    assert.ok(exactOriginal?.input instanceof vscode.TabInputCustom);
    const unchanged = doc.getText();
    await frame.getByRole('button', { name: 'Open comparison in VS Code', exact: true }).click();
    const native = await until(() => vscode.window.tabGroups.all.flatMap(group => group.tabs).find(tab => tab.isActive)?.input,
      input => input instanceof vscode.TabInputTextDiff, 'explicit built-in VS Code text diff');
    assert.ok(native instanceof vscode.TabInputTextDiff);
    assert.equal(native.modified.toString(), uri.toString());
    assert.match(native.original.query, /"ref":"~"/);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.ok(vscode.window.tabGroups.activeTabGroup.activeTab?.input instanceof vscode.TabInputTextDiff, 'Automatic promotion must not hijack the native option');
    assert.equal(doc.getText(), unchanged);
    await vscode.commands.executeCommand('parsiword.nativeStagedDiff', uri);
    const stagedNative = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    assert.ok(stagedNative instanceof vscode.TabInputTextDiff);
    assert.match(stagedNative.original.query, /"ref":"HEAD"/);
    assert.match(stagedNative.modified.query, /"ref":"~"/);
    record('The optional VS Code Diff opens the actual built-in text diff for working-tree and staged revisions without replacing ParsiWord or rewriting Markdown');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await vscode.commands.executeCommand('vscode.open', uri);
    await until(() => api.getOpenDocuments(), docs => docs.some(item => item.visible && item.ready && item.uri === uri.toString() && !item.comparison), 'ordinary editor has no stale comparison');
    assert.ok(vscode.window.tabGroups.all.flatMap(group => group.tabs).some(tab => tab.input instanceof vscode.TabInputCustom && tab.input.viewType === 'parsiword.markdown'));
    record('Returning to a regular Markdown file preserves ParsiWord editing and clears comparison decoration');
    const ordinary = await until(async () => {
      for (const p of browser.contexts().flatMap(context => context.pages())) for (const candidate of p.frames()) {
        try { if (await candidate.locator('.app-shell:not([data-comparison]) .rich-markdown-image img[alt="شرح تصویر"]').count()) return candidate; } catch { /* Reopening replaces its frame. */ }
      }
      return undefined;
    }, value => !!value, 'ordinary rendered image') as Frame;
    const ordinaryImage = ordinary.locator('.rich-markdown-image img[alt="شرح تصویر"]');
    await expect(ordinaryImage).toBeVisible();
    await expect.poll(() => ordinaryImage.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    record('Ordinary VS Code Markdown preview loads the same relative image after closing the comparison');
  } catch (error) {
    await writeFile(join(artifact, 'git-diff-failure.json'), JSON.stringify({
      error: String(error), sessions: api.getOpenDocuments(),
      tabs: vscode.window.tabGroups.all.map(group => ({ column: group.viewColumn, tabs: group.tabs.map(tab => ({
        label: tab.label, active: tab.isActive, input: tab.input instanceof vscode.TabInputCustom ? { type: 'custom', viewType: tab.input.viewType, uri: tab.input.uri.toString() }
          : tab.input instanceof vscode.TabInputTextDiff ? { type: 'text-diff', original: tab.input.original.toString(), modified: tab.input.modified.toString() }
            : { type: tab.input?.constructor.name },
      })) })),
    }, null, 2));
    await page.screenshot({ path: join(artifact, 'git-diff-failure.png') }).catch(() => {});
    throw error;
  } finally {
    await page.setViewportSize(initialViewport);
    await vscode.workspace.saveAll(false);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    await workbench.update('colorTheme', previousTheme, vscode.ConfigurationTarget.Workspace);
    await workbench.update('editorAssociations', previousAssociations, vscode.ConfigurationTarget.Workspace);
  }
}
