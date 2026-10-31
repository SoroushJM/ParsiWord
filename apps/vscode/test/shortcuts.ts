import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { basename, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { expect, type Browser, type Frame } from '@playwright/test';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until<T>(read: () => T | PromiseLike<T>, predicate: (value: T) => boolean, label: string): Promise<T> {
  for (let i = 0; i < 100; i++) { const value = await read(); if (predicate(value)) return value; await pause(100); }
  throw Error(`Timed out: ${label}`);
}

export async function testShortcuts(browser: Browser, artifact: string, record: (text: string) => void) {
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'shortcuts.md');
  const base = '# عنوان شورت‌کات\n\nEnglish **متن فارسی** English.\n\nپایان English.\n';
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(base));
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  const open = async (mode: 'source' | 'rendered') => {
    await vscode.commands.executeCommand('vscode.openWith', uri, `parsiword.markdown.${mode}`, { viewColumn: vscode.ViewColumn.One, preview: false });
    return until(async () => {
      for (const page of browser.contexts().flatMap(context => context.pages())) for (const frame of page.frames()) {
        try { if (await frame.locator(`.live-workspace[data-mode=${mode}]`).count() && (await frame.locator('#markdown-source').inputValue()).includes('عنوان شورت')) return frame; } catch { /* Reopening replaces frames. */ }
      }
      return undefined;
    }, value => !!value, `${mode} shortcut editor`) as Promise<Frame>;
  };
  try {
    let frame = await open('source');
    const en = frame.getByRole('link', { name: 'English', exact: true });
    if (await en.count()) await en.click();
    const doc = await vscode.workspace.openTextDocument(uri);
    const source = frame.locator('#markdown-source');
    await frame.page().bringToFront();
    await expect(source).toHaveValue(base);
    await source.click(); await expect(source).toBeFocused();
    await expect.poll(() => frame.evaluate(() => document.hasFocus())).toBe(true);
    const events: { stage: string; clipboard: string; source?: string; selection?: number[]; activeElement?: string; focused?: boolean; }[] = [];
    const capture = async (stage: string) => {
      const state = await source.evaluate((element: HTMLTextAreaElement) => ({ source: element.value, selection: [element.selectionStart, element.selectionEnd], activeElement: document.activeElement?.id, focused: document.hasFocus() }));
      const value = { stage, clipboard: await vscode.env.clipboard.readText(), ...state }; events.push(value);
      await writeFile(join(artifact, 'shortcuts-clipboard-stages.json'), JSON.stringify(events, null, 2));
      return value;
    };
    await vscode.env.clipboard.writeText('PARSIWORD_CLIPBOARD_SENTINEL');
    const written = await capture('API write sentinel');
    assert.equal(written.clipboard, 'PARSIWORD_CLIPBOARD_SENTINEL', 'VS Code clipboard API must round-trip before testing native Copy');
    await source.press('Control+a');
    assert.deepEqual(await source.evaluate((element: HTMLTextAreaElement) => [element.selectionStart, element.selectionEnd]), [0, base.length]);
    await source.press('Control+c');
    await capture('Ctrl+C');
    try {
      await until(() => vscode.env.clipboard.readText(), text => text.replace(/\r\n/g, '\n') === base, 'native copy and select all');
    } catch (error) {
      const state = await source.evaluate((element: HTMLTextAreaElement) => ({ source: element.value, selection: [element.selectionStart, element.selectionEnd], activeElement: document.activeElement?.id, focused: document.hasFocus() }));
      await writeFile(join(artifact, 'shortcuts-copy-failure.json'), JSON.stringify({ clipboard: await vscode.env.clipboard.readText(), ...state }, null, 2));
      await frame.page().screenshot({ path: join(artifact, 'shortcuts-copy-failure.png') });
      throw error;
    }
    await vscode.env.clipboard.writeText('PASTED فارسی');
    await source.press('Control+v');
    await until(() => doc.getText(), text => text === 'PASTED فارسی', 'native paste');
    await source.press('Control+z'); await until(() => doc.getText(), text => text === base, 'paste undo');
    await source.press('Control+y'); await until(() => doc.getText(), text => text === 'PASTED فارسی', 'Ctrl+Y redo');
    await source.press('Control+z'); await until(() => doc.getText(), text => text === base, 'restore source');
    await expect(source).toHaveValue(base);
    await source.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(2, 7));
    await source.press('Control+x');
    await until(() => doc.getText(), text => text === base.slice(0, 2) + base.slice(7), 'native cut');
    assert.equal(await vscode.env.clipboard.readText(), base.slice(2, 7));
    await source.press('Control+z'); await until(() => doc.getText(), text => text === base, 'cut undo');
    await expect(source).toHaveValue(base);
    await source.press('Control+End'); assert.equal(await source.evaluate((element: HTMLTextAreaElement) => element.selectionStart), base.length);
    await source.press('Control+Home'); await source.press('Shift+End');
    assert.equal(await source.evaluate((element: HTMLTextAreaElement) => element.selectionEnd - element.selectionStart), base.indexOf('\n'));
    await source.press('Control+Home');
    record('Real Ctrl+A/C/X/V and Ctrl+Y preserve native clipboard, source selection and shared document history');

    await source.press('Control+f');
    const query = frame.locator('#editor-find-query');
    await expect(query).toBeFocused(); await query.fill('English');
    await expect(frame.locator('.search-count')).toHaveText('1 / 3');
    assert.deepEqual(await frame.evaluate(() => [...CSS.highlights.get('parsiword-find')!].map(range => range.toString())), ['English', 'English', 'English']);
    await query.fill('english'); await frame.getByRole('button', { name: 'Match case', exact: true }).click();
    await expect(frame.locator('.search-count')).toHaveText('No results');
    await frame.getByRole('button', { name: 'Match case', exact: true }).click(); await query.fill('English');
    await query.press('F3'); await expect(frame.locator('.search-count')).toHaveText('2 / 3');
    await query.press('Shift+F3'); await expect(frame.locator('.search-count')).toHaveText('1 / 3');
    await query.press('Enter'); await expect(frame.locator('.search-count')).toHaveText('2 / 3');
    await query.press('Shift+Enter'); await expect(frame.locator('.search-count')).toHaveText('1 / 3');
    await query.press('End'); await query.pressSequentially('z'); await query.press('Control+z');
    assert.equal(doc.getText(), base);
    await query.fill('English');
    await frame.page().screenshot({ path: join(artifact, 'shortcuts-source.png') });
    await query.press('Escape'); await expect(source).toBeFocused();
    assert.equal(await source.evaluate((element: HTMLTextAreaElement) => element.value.slice(element.selectionStart, element.selectionEnd)), 'English');
    record('Ctrl+F, F3/Shift+F3, Enter/Shift+Enter and Escape find source matches without editing Markdown');

    await source.press('Control+h'); await expect(frame.locator('#editor-replace-text')).toBeVisible();
    await query.press('F3'); await expect(frame.locator('#editor-replace-text')).toBeVisible();
    await query.fill('English'); await frame.locator('#editor-replace-text').fill('$& فارسی');
    await frame.getByRole('button', { name: 'Replace all', exact: true }).click();
    await until(() => doc.getText(), text => text === base.replaceAll('English', () => '$& فارسی'), 'source replace all');
    await query.press('Escape'); await source.press('Control+z'); await until(() => doc.getText(), text => text === base, 'replace all native undo');
    await source.press('Control+g'); await expect(query).toBeFocused(); await query.fill('3:2'); await query.press('Enter');
    await expect(source).toBeFocused();
    assert.equal(await source.evaluate((element: HTMLTextAreaElement) => element.selectionStart), base.indexOf('English') + 1);
    await source.press('Control+s'); await until(() => doc.isDirty, dirty => !dirty, 'shortcut save');
    record('Ctrl+H replaces literal text in one native undo step; Ctrl+G selects the requested Markdown line/column');

    const page = frame.page();
    const picker = page.locator('.quick-input-widget');
    await source.press('Control+p'); await expect(picker).toBeVisible(); await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    await source.press('Control+Shift+p'); await expect(picker).toBeVisible();
    await expect(picker.locator('input').first()).toHaveValue('>'); await page.keyboard.press('Escape');
    await expect(picker).toBeHidden();
    const other = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'other.md');
    await vscode.commands.executeCommand('vscode.openWith', other, 'parsiword.markdown.source', { viewColumn: vscode.ViewColumn.One, preview: false });
    await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown.source', { viewColumn: vscode.ViewColumn.One, preview: false });
    const switchTab = async (reverse: boolean, target: vscode.Uri) => {
      const label = `native Ctrl+${reverse ? 'Shift+' : ''}Tab`;
      try {
        await expect(picker).toBeHidden();
        await page.keyboard.down('Control');
        try {
          await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
          await expect(picker).toBeVisible();
          // Visibility alone does not mean the quick-navigation list is ready
          // to accept Ctrl-up. Wait for its target and keyboard focus first.
          await expect(picker.locator('.monaco-list-row.focused .label-name')).toHaveText(basename(target.path));
          await expect.poll(() => picker.evaluate(element => element.contains(document.activeElement))).toBe(true);
        } finally { await page.keyboard.up('Control'); }
        await expect(picker).toBeHidden();
        await until(() => vscode.window.tabGroups.activeTabGroup.activeTab?.input, input => input instanceof vscode.TabInputCustom && input.uri.toString() === target.toString(), label);
        // The native tab event can precede webview visibility/focus restoration.
        // Start the next chord only after the destination editor receives focus.
        const text = (await vscode.workspace.openTextDocument(target)).getText().replace(/\r\n/g, '\n');
        await until(async () => {
          for (const candidate of page.frames()) {
            try {
              const input = candidate.locator('.live-workspace[data-mode=source] #markdown-source');
              if (await input.isVisible() && await input.inputValue() === text && await candidate.evaluate(() => document.hasFocus())) return true;
            } catch { /* A switching webview can detach while it is being restored. */ }
          }
          return false;
        }, Boolean, `${label} destination webview focus`);
      } catch (error) {
        await writeFile(join(artifact, 'shortcuts-navigation-failure.json'), JSON.stringify({
          label, target: target.toString(), error: String(error),
          tabs: vscode.window.tabGroups.all.map(group => group.tabs.map(tab => ({ label: tab.label, active: tab.isActive, uri: tab.input instanceof vscode.TabInputCustom ? tab.input.uri.toString() : undefined }))),
          picker: await picker.evaluate(element => ({ visible: !!element.getClientRects().length, focused: element.contains(document.activeElement), selected: element.querySelector('.monaco-list-row.focused')?.getAttribute('aria-label') })),
        }, null, 2));
        await page.screenshot({ path: join(artifact, 'shortcuts-navigation-failure.png') });
        throw error;
      }
    };
    await source.click();
    for (let cycle = 0; cycle < 3; cycle++) {
      await switchTab(false, other);
      await switchTab(true, uri);
    }
    record('Ctrl+P, Ctrl+Shift+P and Ctrl+Tab/Shift+Tab reach real VS Code pickers and editor tabs');

    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    frame = await open('rendered');
    const rich = frame.locator('.rich-document');
    await rich.click(); await rich.press('Control+a'); await rich.press('Control+c');
    await until(() => vscode.env.clipboard.readText(), text => text.includes('متن فارسی') && text.includes('English'), 'rendered native copy');
    await vscode.env.clipboard.writeText('PASTE_RICH فارسی'); await rich.press('Control+v');
    await until(async () => (await vscode.workspace.openTextDocument(uri)).getText(), text => text.includes('PASTE_RICH') && !text.includes('English'), 'rendered native paste');
    await rich.press('Control+z'); await until(async () => (await vscode.workspace.openTextDocument(uri)).getText(), text => text === base, 'rendered paste undo');
    await expect(rich).toContainText('English');
    await rich.press('Control+a'); await rich.press('Control+x');
    await until(async () => (await vscode.workspace.openTextDocument(uri)).getText(), text => !text.trim(), 'rendered native cut');
    await rich.press('Control+z'); await until(async () => (await vscode.workspace.openTextDocument(uri)).getText(), text => text === base, 'rendered cut undo');
    await expect(rich).toContainText('English');
    record('Rendered Ctrl+A/C/X/V retains native clipboard behavior and restores exact Markdown through native Undo');
    await rich.click(); await rich.press('Control+Home'); await rich.press('Control+f');
    const richQuery = frame.locator('#editor-find-query');
    await expect(richQuery).toBeFocused(); await richQuery.fill('متن فارسی English');
    await expect(frame.locator('.search-count')).toHaveText('1 / 1');
    assert.equal(doc.getText(), base);
    await richQuery.press('Escape'); await rich.press('Control+h'); await richQuery.fill('English');
    await frame.locator('#editor-replace-text').fill('CHANGED');
    await frame.getByRole('button', { name: 'Replace all', exact: true }).click();
    await until(async () => (await vscode.workspace.openTextDocument(uri)).getText(), text => text === base.replaceAll('English', 'CHANGED'), 'rich replace all');
    await richQuery.press('Escape'); await rich.press('Control+z');
    await until(async () => (await vscode.workspace.openTextDocument(uri)).getText(), text => text === base, 'rich replace shared undo');
    await rich.press('Control+g'); await richQuery.fill('5'); await richQuery.press('Enter');
    await expect(rich).toBeFocused();
    assert.match(await rich.evaluate(() => getSelection()?.anchorNode?.textContent ?? ''), /پایان/);
    await rich.press('Control+s');
    await frame.page().screenshot({ path: join(artifact, 'shortcuts-rendered.png') });
    record('Rendered-only Ctrl+F matches across inline marks; Ctrl+H uses rich transactions and native Undo; Ctrl+G reaches the mapped Markdown block');
  } finally { await vscode.workspace.saveAll(false); await vscode.commands.executeCommand('workbench.action.closeAllEditors'); }
}
