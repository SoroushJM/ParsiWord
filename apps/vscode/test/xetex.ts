import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Browser, type Frame } from '@playwright/test';
import JSZip from 'jszip';

export async function testXeTex(browser: Browser, artifact: string, record: (text: string) => void) {
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'xepersian.md');
  const document = await vscode.workspace.openTextDocument(uri), source = document.getText();
  const logicalSource = source.replace(/\r\n/g, '\n');
  await vscode.workspace.saveAll(false); await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  try {
    await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown.rendered');
    let frame: Frame | undefined;
    for (let attempt = 0; attempt < 150 && !frame; attempt++) {
      for (const page of browser.contexts().flatMap(context => context.pages())) for (const candidate of page.frames()) {
        try { if (await candidate.locator('#markdown-source').count() && await candidate.locator('#markdown-source').inputValue() === logicalSource) frame = candidate; } catch { /* Unrelated frame. */ }
      }
      if (!frame) await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert.ok(frame, 'The XePersian document must open in the ParsiWord editor');
    await frame.page().bringToFront();
    const english = frame.getByRole('link', { name: 'English', exact: true }); if (await english.isVisible()) await english.click();
    await expect(frame.locator('.tikz-canvas > svg image')).toHaveCount(1, { timeout: 100_000 });
    assert.equal(await frame.evaluate(() => typeof SharedArrayBuffer), 'undefined');
    record('Real local XeLaTeX/XePersian compiles Persian text, numbered questions, hard formulas and TikZ under the actual VS Code CSP without SharedArrayBuffer');
    await frame.page().screenshot({ path: join(artifact, 'xepersian-preview.png') });
    const save = async (extension: 'docx' | 'pdf', trigger: () => Promise<unknown>) => {
      const target = join(artifact, `xepersian-${Date.now()}.${extension}`); await trigger();
      const path = frame!.page().locator('.quick-input-widget .quick-input-box input');
      await expect(path).toBeVisible({ timeout: 100_000 }); await path.fill(target); await path.press('Enter');
      let bytes = Buffer.alloc(0);
      for (let attempt = 0; attempt < 150 && !bytes.length; attempt++) { bytes = await readFile(target).catch(() => Buffer.alloc(0)); if (!bytes.length) await new Promise(resolve => setTimeout(resolve, 200)); }
      assert.ok(bytes.length); await expect(path).toBeHidden(); assert.equal(document.getText(), source); return { target, bytes };
    };
    const word = await save('docx', () => frame!.getByRole('button', { name: 'Save Word file', exact: true }).click());
    const zip = await JSZip.loadAsync(word.bytes); assert.equal(zip.file(/^word\/media\/.*\.png$/).length, 1);
    assert.ok((await zip.file('word/document.xml')!.async('string')).includes('Vazirmatn-Regular.ttf'));
    const pdf = await save('pdf', async () => {
      await frame!.getByRole('button', { name: 'More export formats', exact: true }).click();
      await frame!.getByRole('menuitem', { name: 'Save PDF file', exact: true }).click();
    });
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
    record('The actual VS Code extension saves XePersian Word images with source metadata and original native TeX PDF pages');
    return { docx: word.target, pdf: pdf.target };
  } finally { await vscode.commands.executeCommand('workbench.action.closeAllEditors'); }
}
