import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { cachedFonts, ensureFont, initialCatalogue, removeFont, validateFont } from './fonts';

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase('parsiword-fonts-v1'); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
});

describe('font downloads are stored for offline Word exports', () => {
  it('includes the full public catalogue with searchable Persian support and variants', () => {
    expect(initialCatalogue.length).toBeGreaterThan(1900);
    expect(initialCatalogue.find(f => f.family === 'Vazirmatn')?.arabic).toBe(true);
    expect(initialCatalogue.find(f => f.family === 'Roboto')?.weights).toContain(400);
  });
  it('stores complete regular and bold downloads and subsequently works without network', async () => {
    const bytes = new Uint8Array(await readFile('public/fonts/Vazirmatn-Regular.ttf'));
    const font = { family: 'Offline Test', arabic: true, weights: [400, 700] };
    const download = vi.fn(async () => bytes);
    await ensureFont(font, download);
    expect(download).toHaveBeenCalledTimes(2);
    const offline = vi.fn(async () => { throw new Error('offline'); });
    const restored = await ensureFont(font, offline);
    expect(restored.regular).toEqual(bytes); expect(restored.bold).toEqual(bytes);
    expect(offline).not.toHaveBeenCalled();
    expect(await cachedFonts()).toHaveLength(1);
    await removeFont(font.family);
    expect(await cachedFonts()).toHaveLength(0);
  });
  it('does not mark a partially downloaded family as cached', async () => {
    const bytes = new Uint8Array(await readFile('public/fonts/Vazirmatn-Regular.ttf'));
    const download = vi.fn().mockResolvedValueOnce(bytes).mockRejectedValueOnce(new Error('network'));
    await expect(ensureFont({ family: 'Partial Test', arabic: false, weights: [400, 700] }, download)).rejects.toThrow('network');
    expect(await cachedFonts()).toHaveLength(0);
  });
  it('rejects WOFF2 or an HTML error page instead of embedding it as a TrueType font', () => {
    expect(() => validateFont(new TextEncoder().encode('wOF2' + 'x'.repeat(50)))).toThrow('FONT_FORMAT');
    expect(() => validateFont(new TextEncoder().encode('<html>server error</html>'))).toThrow('FONT_FORMAT');
  });
});

it('keeps old draft font choices portable when retiring system-only fonts', async () => {
  const { normalizeFontFamily } = await import('./fonts');
  for (const family of ['Arial', 'Tahoma', 'Times New Roman', 'Courier New']) expect(normalizeFontFamily(family)).toBe('Vazirmatn');
  expect(normalizeFontFamily('Noto Naskh Arabic')).toBe('Noto Naskh Arabic');
});

it('detects required fonts through Markdown structure, including nested math and literal code', async () => {
  const { documentFontUsage } = await import('./markdown');
  expect(documentFontUsage('متن ساده')).toEqual({ code: false, math: false });
  expect(documentFontUsage('> $x^2$\n\n- `fn()`')).toEqual({ code: true, math: true });
  expect(documentFontUsage('```mermaid\ngraph TD\nA-->B\n```')).toEqual({ code: false, math: false });
  expect(documentFontUsage('```latex\nx^2\n```')).toEqual({ code: false, math: true });
  expect(documentFontUsage('```js\n$x^2$\n```')).toEqual({ code: true, math: false });
});
