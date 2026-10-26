import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Browser, type Frame } from '@playwright/test';
import JSZip from 'jszip';

type Diagnostics = { getOpenDocuments(): { uri: string; ready: boolean }[] };
async function until<T>(read: () => T | PromiseLike<T>, predicate: (value: T) => boolean, label: string): Promise<T> {
  for (let attempt = 0; attempt < 150; attempt++) {
    const value = await read(); if (predicate(value)) return value;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error(`Timed out: ${label}`);
}

export async function testTikz(browser: Browser, api: Diagnostics, artifact: string, record: (text: string) => void) {
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'tikz.md');
  const document = await vscode.workspace.openTextDocument(uri), source = document.getText();
  const paths: Record<string, string> = {};
  const diagnostics: string[] = [];
  for (const page of browser.contexts().flatMap(context => context.pages())) {
    page.on('console', event => { if (event.type() === 'error') diagnostics.push(event.text().slice(0, 2000)); });
    await page.addInitScript(() => {
      const trace: unknown[] = [];
      Object.assign(window, { __tikzRuntimeTrace: trace });
      const OriginalWorker = window.Worker;
      window.Worker = class extends OriginalWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options); trace.push({ event: 'worker', url: String(url), time: performance.now() });
          this.addEventListener('message', event => { const data = event.data; trace.push({ event: 'message', data: typeof data === 'string' ? data.slice(0, 500) : { type: data?.type, uid: data?.uid, complete: data?.complete }, time: performance.now() }); });
          this.addEventListener('error', event => trace.push({ event: 'error', message: event.message, time: performance.now() }));
        }
        postMessage(message: unknown, options?: StructuredSerializeOptions | Transferable[]) { trace.push({ event: 'send', message, time: performance.now() }); super.postMessage(message, options as StructuredSerializeOptions); }
      };
    });
  }
  let observed: Frame | undefined;
  await vscode.workspace.saveAll(false);
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  try {
    await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown.rendered');
    await until(() => api.getOpenDocuments(), items => items.some(item => item.uri === uri.toString() && item.ready), 'TikZ custom editor');
    const frame = await until(async () => {
      for (const page of browser.contexts().flatMap(context => context.pages())) for (const candidate of page.frames()) {
        try { const input = candidate.locator('#markdown-source'); if (await input.count() && await input.inputValue() === source) return candidate; } catch { /* Unrelated VS Code frame. */ }
      }
      return undefined;
    }, value => !!value, 'TikZ webview') as Frame;
    observed = frame;
    await frame.page().bringToFront();
    const english = frame.getByRole('link', { name: 'English', exact: true });
    if (await english.isVisible()) await english.click();
    await expect(frame.locator('.tikz-diagram svg')).toBeVisible({ timeout: 45_000 });
    assert.ok(await frame.locator('.tikz-diagram svg path').count() > 12, 'Real geometry and label outlines must be present under the webview CSP');
    await expect(frame.locator('.tikz-diagram svg text, .tikz-diagram svg script, .tikz-diagram svg foreignObject')).toHaveCount(0);
    record('Real local TeX/WASM compiles TikZ geometry, libraries and math-label outlines inside the VS Code webview');
    const originalBody = /```tikz\n([\s\S]*?)\n```/.exec(source)![1];
    await frame.getByRole('button', { name: 'Edit TikZ drawing', exact: true }).click();
    const input = frame.getByRole('textbox', { name: 'TikZ source', exact: true });
    const changed = originalBody.replace('blue,thick', 'green,thick');
    await input.fill(changed);
    assert.equal(document.getText(), source, 'An unconfirmed dialog draft must not mutate the native document');
    await frame.getByRole('button', { name: 'Apply', exact: true }).click();
    await until(() => document.getText(), text => text === source.replace(originalBody, changed), 'confirmed TikZ source reaches native document');
    await vscode.commands.executeCommand('undo');
    await until(() => document.getText(), text => text === source, 'native Undo restores original TikZ source');
    await vscode.commands.executeCommand('redo');
    await until(() => document.getText(), text => text === source.replace(originalBody, changed), 'native Redo restores TikZ edit');
    await vscode.commands.executeCommand('undo');
    await until(() => document.getText(), text => text === source, 'restore original TikZ before export');
    await expect(frame.locator('.tikz-diagram')).toHaveAttribute('aria-busy', 'false', { timeout: 45_000 });
    record('TikZ dialog changes share the actual VS Code TextDocument Undo/Redo history and preserve the Markdown source');
    await frame.page().screenshot({ path: join(artifact, 'tikz-preview.png') });
    const save = async (extension: 'docx' | 'pdf', trigger: () => Promise<unknown>) => {
      const target = join(artifact, `tikz-${Date.now()}.${extension}`);
      await trigger();
      const path = frame.page().locator('.quick-input-widget .quick-input-box input');
      await expect(path).toBeVisible({ timeout: 45_000 }); await path.fill(target); await path.press('Enter');
      const bytes = await until(() => readFile(target).catch(() => Buffer.alloc(0)), value => value.length > 0, `${extension} TikZ export`);
      await expect(path).toBeHidden(); paths[extension] = target;
      assert.equal(document.getText(), source); return bytes;
    };
    const word = await save('docx', () => frame.getByRole('button', { name: 'Save Word file', exact: true }).click());
    const zip = await JSZip.loadAsync(word), xml = await zip.file('word/document.xml')!.async('string');
    assert.ok(xml.includes('TIKZ_NATIVE_SEARCHABLE') && xml.includes('TikZ diagram') && xml.includes('<m:oMath '));
    const media = zip.file(/^word\/media\/.*\.png$/); assert.equal(media.length, 1);
    const png = await media[0].async('nodebuffer'); assert.ok(png.readUInt32BE(16) > 100 && png.readUInt32BE(20) > 100);
    record('VS Code saves real TikZ PNG bytes and source alt text into Word alongside editable text and native equations');
    const pdf = await save('pdf', async () => {
      await frame.getByRole('button', { name: 'More export formats', exact: true }).click();
      await frame.getByRole('menuitem', { name: 'Save PDF file', exact: true }).click();
    });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.toString('latin1').includes('/ToUnicode'));
    record('VS Code saves TikZ into PDF without changing the Markdown document');
    return paths;
  } catch (error) {
    const trace = await observed?.evaluate(() => (window as unknown as { __tikzRuntimeTrace?: unknown[] }).__tikzRuntimeTrace).catch(() => undefined);
    await writeFile(join(artifact, 'tikz-runtime-failure.json'), JSON.stringify({ error: String(error), diagnostics, trace }, null, 2));
    throw error;
  } finally { await vscode.commands.executeCommand('workbench.action.closeAllEditors'); }
}
