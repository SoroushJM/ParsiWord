import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { expect, type Browser, type Frame } from '@playwright/test';
import { join } from 'node:path';

const table = '| نام | سن |\n| :--- | ---: |\n| علی | ۲۰ | تهران |\n| سارا |\n| رضا | ۴۰ | شیراز | مهندس |';
const before = '# قبل\n\n__قالب__ &amp; محفوظ\n\n', after = '\n\nبعد \\*محفوظ\\*';
const original = before + table + after;

async function findFrame(browser: Browser): Promise<Frame> {
  for (let attempt = 0; attempt < 100; attempt++) {
    for (const page of browser.contexts().flatMap(context => context.pages())) for (const frame of page.frames()) {
      try { if (await frame.locator('.rich-document table').isVisible()) return frame; } catch { /* Webview mounts asynchronously. */ }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error('Actual VS Code table editor did not appear');
}

export async function testTables(browser: Browser, artifact: string, record: (text: string) => void) {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'irregular-table.md');
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(original));
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown.rendered');
  let frame = await findFrame(browser);
  const english = frame.getByRole('link', { name: 'English', exact: true });
  if (await english.count()) await english.click();
  const rich = () => frame.locator('.rich-document');
  const widths = () => rich().locator('tr').evaluateAll(rows => rows.map(row => row.children.length));
  const repair = () => frame.getByRole('button', { name: 'Complete table columns', exact: true });
  await rich().locator('td').first().click();
  await expect(repair()).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Add column', exact: true })).toBeDisabled();
  await expect(frame.getByRole('button', { name: 'Delete column', exact: true })).toBeDisabled();
  assert.equal(document.getText(), original);
  assert.deepEqual(await widths(), [2, 3, 1, 4]);
  await repair().click();
  await expect.poll(() => document.getText()).not.toBe(original);
  assert.deepEqual(await widths(), [4, 4, 4, 4]);
  const repaired = document.getText();
  assert.ok(repaired.startsWith(before) && repaired.endsWith(after));
  await expect(repair()).toHaveCount(0);
  await expect(frame.getByRole('button', { name: 'Add column', exact: true })).toBeEnabled();
  await vscode.commands.executeCommand('undo');
  await expect.poll(() => document.getText()).toBe(original);
  // Native Undo reloads the document and may restore a selection outside the
  // table. Table tools intentionally appear only for the selected table.
  await rich().locator('td').first().click();
  await expect(repair()).toBeVisible();
  assert.deepEqual(await widths(), [2, 3, 1, 4]);
  await vscode.commands.executeCommand('redo');
  await expect.poll(() => document.getText()).toBe(repaired);
  await expect(repair()).toHaveCount(0);
  await document.save();
  await browser.contexts()[0].pages()[0].screenshot({ path: join(artifact, 'table-repaired.png') });
  record('Native VS Code repair retains every extra cell, edits the native document, preserves surrounding source, and supports single-step native Undo/Redo');

  await vscode.commands.executeCommand('undo');
  await expect.poll(() => document.getText()).toBe(original);
  await rich().locator('td').first().click();
  await expect(repair()).toBeVisible();
  await rich().locator('tr').nth(2).locator('td').first().click();
  await frame.getByRole('button', { name: 'Add row', exact: true }).click();
  await expect(rich().locator('tr')).toHaveCount(5);
  await expect.poll(() => document.getText()).not.toBe(original);
  assert.deepEqual(await widths(), [2, 3, 1, 2, 4]);
  const withRow = document.getText();
  await document.save();
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown.rendered');
  frame = await findFrame(browser);
  await expect(rich().locator('tr')).toHaveCount(5);
  assert.deepEqual(await widths(), [2, 3, 1, 2, 4]);
  await rich().locator('tr').nth(3).locator('td').first().click();
  await frame.getByRole('button', { name: 'Delete row', exact: true }).click();
  await expect(rich().locator('tr')).toHaveCount(4);
  await expect.poll(() => document.getText()).not.toBe(withRow);
  assert.deepEqual(await widths(), [2, 3, 1, 4]);
  await vscode.commands.executeCommand('undo');
  await expect.poll(() => document.getText()).toBe(withRow);
  await expect(rich().locator('tr')).toHaveCount(5);
  await document.save();
  record('Native VS Code row insertion follows header width; save/reopen and row deletion retain ragged rows and native Undo');
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
