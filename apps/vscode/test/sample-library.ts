import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { expect, type Browser, type Frame } from '@playwright/test';

async function findFrame(browser: Browser): Promise<Frame> {
  for (let attempt = 0; attempt < 100; attempt++) {
    for (const page of browser.contexts().flatMap(context => context.pages())) for (const frame of page.frames()) {
      try { if (await frame.locator('.editor-status button[title="Sample documents"], .editor-status button[title="متن‌های نمونه"]').isVisible()) return frame; } catch { /* Mounting webview. */ }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error('Sample library missing from actual VS Code editor');
}

export async function testSampleLibrary(browser: Browser, record: (text: string) => void) {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'sample-library.md');
  const wide = '| ' + Array(12).fill('ستون').join(' | ') + ' |\n| ' + Array(12).fill('---').join(' | ') + ' |\n| ' + Array(12).fill('داده').join(' | ') + ' |';
  const original = '# NATIVE_SAMPLES\n\n__محفوظ__ &amp;\n\n' + wide + '\n\n| نوع | فرمول |\n| --- | --- |\n| بلند | $' + Array(24).fill(String.raw`\frac{x^2+1}{3}`).join('+') + '$ |';
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(original));
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown');
  let frame = await findFrame(browser);
  const english = frame.getByRole('link', { name: 'English', exact: true });
  if (await english.count()) await english.click();
  await expect.poll(() => frame.locator('.tableWrapper').first().evaluate(el => el.scrollWidth > el.clientWidth + 20)).toBe(true);
  await expect(frame.locator('.math-scroll[data-overflow="true"]')).toHaveCount(1);
  assert.ok(await frame.evaluate(() => globalThis.document.documentElement.scrollWidth <= innerWidth + 1));
  assert.equal(document.getText(), original);
  record('Actual VS Code wide table and oversized formula scroll locally without horizontal page overflow or source edits');

  const open = async () => { await frame.getByRole('button', { name: 'Sample documents', exact: true }).click(); return frame.getByRole('dialog'); };
  const choose = async (name: string) => { const dialog = await open(); await dialog.getByLabel('Search samples').fill(name); await dialog.getByRole('button', { name, exact: false }).first().click(); await expect(dialog).not.toBeVisible(); };
  await choose('Wide table');
  await expect.poll(() => document.getText()).toContain('# جدول عریض روی گوشی');
  const first = document.getText();
  await choose('Advanced mathematics');
  await expect.poll(() => document.getText()).toContain('# فرمول‌های پیشرفته');
  const second = document.getText();
  await vscode.commands.executeCommand('undo');
  await expect.poll(() => document.getText()).toBe(first);
  await vscode.commands.executeCommand('undo');
  await expect.poll(() => document.getText()).toBe(original);
  await vscode.commands.executeCommand('redo');
  await expect.poll(() => document.getText()).toBe(first);
  await vscode.commands.executeCommand('redo');
  await expect.poll(() => document.getText()).toBe(second);
  record('Successive sample replacements are separate native VS Code Undo/Redo steps and restore exact original Markdown');

  let dialog = await open();
  await dialog.getByLabel('Personal sample name').fill('NATIVE_PERSONAL_SAMPLE');
  await dialog.getByRole('button', { name: 'Save current text', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'NATIVE_PERSONAL_SAMPLE', exact: true })).toBeVisible();
  await frame.page().keyboard.press('Escape');
  await document.save();
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown');
  frame = await findFrame(browser);
  dialog = await open();
  await expect(dialog.getByRole('button', { name: 'NATIVE_PERSONAL_SAMPLE', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete sample NATIVE_PERSONAL_SAMPLE', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'NATIVE_PERSONAL_SAMPLE', exact: true })).toHaveCount(0);
  record('Personal sample survives destroying/reopening the VS Code webview and can be deleted');
}
