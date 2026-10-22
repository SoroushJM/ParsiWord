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

it('downloads browser fonts from static TTF URLs and refreshes the project-path catalogue', async () => {
  vi.resetModules();
  const { downloadFace, refreshCatalogue, ensureFont } = await import('./fonts');
  const regular = new Uint8Array(await readFile('public/fonts/Vazirmatn-Regular.ttf'));
  const bold = new Uint8Array(await readFile('public/fonts/Vazirmatn-Bold.ttf'));
  const urls = { '400': 'https://fonts.gstatic.com/s/roboto/test-regular.ttf', '700': 'https://fonts.gstatic.com/s/roboto/test-bold.ttf' };
  const fetch = vi.fn(async (url: string | URL | Request) => {
    if (String(url) === '/parsiword/font-catalogue.json') return Response.json({ updated: '2026-10-22', families: [
      { family: 'Roboto', arabic: false, weights: [400, 700], faces: urls },
      { family: 'Single Weight', arabic: false, weights: [400], faces: { '400': urls['400'] } },
    ] });
    if (String(url) === urls['400']) return new Response(regular.slice().buffer);
    if (String(url) === urls['700']) return new Response(bold.slice().buffer);
    throw new Error(`Unexpected resource: ${url}`);
  });
  vi.stubEnv('BASE_URL', '/parsiword/');
  vi.stubGlobal('fetch', fetch);
  try {
    expect((await refreshCatalogue())[0].family).toBe('Roboto');
    expect(await downloadFace('Roboto', 400)).toEqual(regular);
    expect(await downloadFace('Roboto', 700)).toEqual(bold);
    expect(fetch.mock.calls.map(call => String(call[0]))).toEqual(['/parsiword/font-catalogue.json', urls['400'], urls['700']]);
    const single = await ensureFont({ family: 'Single Weight', arabic: false, weights: [400, 700] });
    expect(single.regular).toEqual(regular);
    expect(single.bold).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(4);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});

it('ships static TTF URLs for every searchable family with distinct regular/bold examples', async () => {
  const manifest = JSON.parse(await readFile('public/font-catalogue.json', 'utf8')) as { families: { family: string; faces: Record<string, string> }[] };
  expect(manifest.families.map(font => font.family)).toEqual(initialCatalogue.map(font => font.family));
  for (const font of manifest.families) {
    expect(Object.values(font.faces).length).toBeGreaterThan(0);
    for (const url of Object.values(font.faces)) expect(url).toMatch(/^https:\/\/fonts\.gstatic\.com\/s\/.*\.(?:ttf|otf)$/);
  }
  for (const family of ['Roboto', 'Noto Naskh Arabic']) {
    const faces = manifest.families.find(font => font.family === family)!.faces;
    expect(faces['400']).toBeTruthy();
    expect(faces['700']).toBeTruthy();
    expect(faces['400']).not.toBe(faces['700']);
  }
});
