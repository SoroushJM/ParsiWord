import * as vscode from 'vscode';
import * as assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, type Browser, type Frame } from '@playwright/test';
import JSZip from 'jszip';

type Diagnostics = { getOpenDocuments(): { uri: string; ready: boolean }[] };
const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
async function until<T>(read: () => T | PromiseLike<T>, predicate: (value: T) => boolean, label: string): Promise<T> {
  for (let attempt = 0; attempt < 100; attempt++) {
    const value = await read();
    if (predicate(value)) return value;
    await wait(200);
  }
  throw Error(`Timed out: ${label}`);
}

/** Exercises the same host resource resolver and save flow used by real files. */
export async function testImageExports(browser: Browser, api: Diagnostics, artifact: string, record: (text: string) => void) {
  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, 'image export/image-export.md');
  const document = await vscode.workspace.openTextDocument(uri);
  const source = document.getText();
  const paths: Record<string, string> = {};
  await vscode.workspace.saveAll(false);
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  try {
    await vscode.commands.executeCommand('vscode.openWith', uri, 'parsiword.markdown.rendered');
    await until(() => api.getOpenDocuments(), items => items.some(item => item.uri === uri.toString() && item.ready), 'image export custom editor ready');
    const frame = await until(async () => {
      for (const page of browser.contexts().flatMap(context => context.pages())) for (const candidate of page.frames()) {
        try {
          const input = candidate.locator('.app-shell:not([data-comparison]) #markdown-source');
          if (await input.count() && await input.inputValue() === source) return candidate;
        } catch { /* Opening a custom editor replaces its frame. */ }
      }
      return undefined;
    }, value => !!value, 'local image export workspace') as Frame;
    const page = frame.page();
    const english = frame.getByRole('link', { name: 'English', exact: true });
    if (await english.isVisible()) await english.click();
    for (const [alt, ratio] of [['بردار SVG', 1.6], ['نگاره PNG', 64 / 48]] as const) {
      const image = frame.getByAltText(alt, { exact: true });
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0 && element.naturalHeight > 0)).toBe(true);
      const dimensions = await image.evaluate((element: HTMLImageElement) => ({ width: element.naturalWidth, height: element.naturalHeight }));
      assert.ok(Math.abs(dimensions.width / dimensions.height - ratio) < .01, `${alt} must keep its native aspect ratio`);
      assert.match(await image.getAttribute('src') ?? '', /vscode-(?:resource|webview)/);
    }
    assert.equal(document.getText(), source);
    record('Local SVG and reference-style PNG images with a spaced relative path load in the actual VS Code editor');
    await page.screenshot({ path: join(artifact, 'image-export-preview.png') });
    const save = async (extension: 'docx' | 'pdf', trigger: () => Promise<unknown>) => {
      const target = join(artifact, `local-images-${Date.now()}.${extension}`);
      await trigger();
      const input = page.locator('.quick-input-widget .quick-input-box input');
      await expect(input).toBeVisible({ timeout: 30000 });
      await input.fill(target); await input.press('Enter');
      const bytes = await until(() => readFile(target).catch(() => Buffer.alloc(0)), value => value.length > 0, `${extension} image export file`);
      await expect(input).toBeHidden();
      assert.equal(document.getText(), source, `Exporting ${extension} must leave Markdown byte-exact`);
      paths[extension] = target;
      return bytes;
    };
    const word = await save('docx', () => frame.getByRole('button', { name: 'Save Word file', exact: true }).click());
    const zip = await JSZip.loadAsync(word);
    const xml = await zip.file('word/document.xml')!.async('string');
    const relationships = await zip.file('word/_rels/document.xml.rels')!.async('string');
    assert.ok(xml.includes('SEARCHABLE_IMAGE_EXPORT'), 'Word export must retain editable surrounding text');
    const pictures = [...relationships.matchAll(/<Relationship\b[^>]+>/g)].map(match => match[0])
      .filter(value => /Type="[^"]*\/image"/.test(value));
    assert.equal(pictures.length, 2, 'The image-only fixture must embed both actual Markdown images');
    const sizes: { width: number; height: number }[] = [];
    for (const relationship of pictures) {
      const id = /\bId="([^"]+)"/.exec(relationship)![1];
      const target = /\bTarget="([^"]+)"/.exec(relationship)![1];
      assert.ok(xml.includes(`r:embed="${id}"`), 'Each media resource must be placed in the Word document');
      const media = zip.file(`word/${target}`);
      assert.ok(media, `Word image relationship must resolve to packaged media: ${target}`);
      const bytes = await media.async('nodebuffer');
      assert.ok(bytes.length > 24, 'An exported image must contain real image data');
      if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        sizes.push({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
      } else assert.fail('Word images must contain normalized PNG data');
    }
    assert.ok(sizes.some(size => Math.abs(size.width / size.height - 1.6) < .01), 'The vector circle image must keep its aspect ratio');
    assert.ok(sizes.some(size => size.width === 64 && size.height === 48), 'The raster image must retain its native dimensions');
    record('Actual VS Code Word export embeds both local SVG/PNG Markdown images as used media, preserves aspect ratios and editable text');
    const pdf = await save('pdf', async () => {
      await frame.getByRole('button', { name: 'More export formats', exact: true }).click();
      await frame.getByRole('menuitem', { name: 'Save PDF file', exact: true }).click();
    });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.toString('latin1').includes('/ToUnicode'), 'Image export must retain searchable vector text');
    record('Actual VS Code PDF export writes local Markdown images and retains Unicode text mappings without changing source');
    return paths;
  } finally {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  }
}
