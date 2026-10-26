import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOMParser as XmlParser, XMLSerializer } from '@xmldom/xmldom';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { outlineTikzSvg, type TikzGlyphFont } from './tikz-svg';

// The production path runs browser DOM. Keep the node test adapter limited to
// the DOM traversal/mutation methods used by this sanitizer, without a renderer.
function browserNode<T extends object>(value: T): T {
  const node = value as T & { nodeType: number; childNodes: ArrayLike<object>; children?: object[]; getElementsByTagName?: (name: string) => ArrayLike<object>; querySelectorAll?: (name: string) => object[]; querySelector?: (name: string) => object | null; appendChild?: (node: object) => void; append?: (node: object) => void; replaceWith?: (node: object) => void; parentNode?: { replaceChild(node: object, old: object): void }; createElementNS?: (namespace: string, name: string) => object };
  if (node.getElementsByTagName) {
    node.querySelectorAll = name => Array.from(node.getElementsByTagName!(name)).map(browserNode);
    node.querySelector = name => node.querySelectorAll!(name)[0] || null;
  }
  if (node.nodeType === 1) {
    Object.defineProperty(node, 'children', { configurable: true, get: () => Array.from(node.childNodes).filter(child => (child as { nodeType: number }).nodeType === 1) });
    node.append = child => node.appendChild!(child);
    node.replaceWith = child => node.parentNode!.replaceChild(child, node);
  }
  if (node.nodeType === 9) {
    const create = node.createElementNS!.bind(node);
    node.createElementNS = (namespace, name) => browserNode(create(namespace, name));
  }
  return value;
}
function installDom() {
  vi.stubGlobal('DOMParser', class { parseFromString(source: string) { const document = browserNode(new XmlParser().parseFromString(source, 'image/svg+xml')); browserNode(document.documentElement!); return document; } });
  vi.stubGlobal('XMLSerializer', XMLSerializer);
}
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60">${body}</svg>`;
const font: TikzGlyphFont = { unitsPerEm: 1000, glyphs: { 61554: [450, 'M0 0L200 600L400 0Z'], 61555: [400, 'M0 0L100 600Z'] } };
afterEach(() => vi.unstubAllGlobals());
describe('TikZ SVG boundary and self-contained labels', () => {
  it('outlines every TeX glyph at its original baseline, advance and inherited transform', async () => {
    installDom();
    const load = vi.fn(async () => font);
    const result = await outlineTikzSvg(svg('<g fill="#036"><text font-family="cmmi10" font-size="10" x="2" y="15" transform="rotate(5)">&#xf072;&#xf073;</text></g>'), load);
    expect(result).toMatchObject({ width: 80, height: 60 });
    expect(load).toHaveBeenCalledExactlyOnceWith('cmmi10');
    expect(result.svg).not.toContain('<text');
    expect(result.svg).not.toContain('font-family');
    expect(result.svg).toContain('translate(2,15) scale(0.01,-0.01)');
    expect(result.svg).toContain('translate(6.5,15) scale(0.01,-0.01)');
    expect(result.svg).toContain('rotate(5)');
  });
  it('reads the actual shipped mathematical font outlines without unknown glyphs', async () => {
    installDom();
    const result = await outlineTikzSvg(svg('<text x="0" y="10" font-family="cmmi10" font-size="10">&#xf072;&#xf04f;</text><text x="8" y="12" font-family="cmr7" font-size="7">&#xf031;&#xf032;</text>'), async name => JSON.parse(gunzipSync(readFileSync(new URL(`../public/tikz/glyphs/${name}.json.gz.bin`, import.meta.url))).toString()));
    expect(result.svg.match(/<path/g)).toHaveLength(4);
    expect(result.svg).not.toMatch(/<text|font-family|data:|https?:\/\/(?!www.w3.org)/);
  });
  it('namespaces PGF patterns and local references independently across pictures', async () => {
    installDom();
    const source = svg('<defs><pattern id="pgfpat0" width="3" height="3"><path d="M0 0L1 1"/></pattern></defs><path d="M0 0L5 5" fill="url(#pgfpat0)"/>');
    const first = await outlineTikzSvg(source, async () => font), second = await outlineTikzSvg(source, async () => font);
    const firstId = /id="([^"]+)"/.exec(first.svg)![1], secondId = /id="([^"]+)"/.exec(second.svg)![1];
    expect(firstId).not.toBe(secondId);
    expect(first.svg).toContain(`fill="url(#${firstId})"`);
    expect(second.svg).toContain(`fill="url(#${secondId})"`);
  });
  it.each([
    '<script>alert(1)</script>', '<foreignObject><div>HTML</div></foreignObject>', '<image href="https://example.com/x.png"/>', '<path onload="alert(1)" d="M0 0"/>', '<use href="https://example.com/x.svg#x"/>', '<path style="position:fixed;inset:0" d="M0 0"/>', '<path fill="url(https://example.com/x.svg)" d="M0 0"/>', '<path fill="url(#absent)" d="M0 0"/>', '<g id="dup"/><g id="dup"/>', '<animate attributeName="width"/>',
  ])('rejects unsafe TeX-special output: %s', async body => {
    installDom(); await expect(outlineTikzSvg(svg(body), async () => font)).rejects.toThrow();
  });
  it('rejects missing glyphs rather than silently losing labels', async () => {
    installDom(); await expect(outlineTikzSvg(svg('<text font-family="cmr10" font-size="10">X</text>'), async () => font)).rejects.toThrow('Missing TikZ font glyph');
  });
  it('rejects recursive local references before rasterization', async () => {
    installDom(); await expect(outlineTikzSvg(svg('<defs><g id="loop"><use href="#loop"/></g></defs><use href="#loop"/>'), async () => font)).rejects.toThrow('Recursive');
  });
  it('rejects a compact exponentially expanding use graph', async () => {
    installDom();
    const definitions = '<g id="item0"><path d="M0 0L1 1"/></g>' + Array.from({ length: 19 }, (_, index) => `<g id="item${index + 1}"><use href="#item${index}"/><use href="#item${index}"/></g>`).join('');
    await expect(outlineTikzSvg(svg(`<defs>${definitions}</defs><use href="#item19"/>`), async () => font)).rejects.toThrow('complex');
  });
  it('rejects excessive glyph expansion before loading a font or creating paths', async () => {
    installDom(); const load = vi.fn(async () => font);
    await expect(outlineTikzSvg(svg(`<text font-family="cmmi10" font-size="10">${'&#xf072;'.repeat(12_001)}</text>`), load)).rejects.toThrow('complex');
    expect(load).not.toHaveBeenCalled();
  });
  it('preserves SVG physical point dimensions in CSS pixel export coordinates', async () => {
    installDom(); const result = await outlineTikzSvg('<svg xmlns="http://www.w3.org/2000/svg" width="72pt" height="36pt" viewBox="-5 -5 72 36"><path d="M0 0L1 1"/></svg>', async () => font);
    expect(result).toMatchObject({ width: 96, height: 48 });
    expect(result.svg).toContain('viewBox="-5 -5 72 36"');
    expect(result.svg).toContain('width="96" height="48"');
  });
  it('rejects nonpositive and excessive drawing bounds', async () => {
    installDom(); for (const bounds of ['0 0 0 10', '0 0 10 -1', '0 0 30000 2', 'NaN 0 1 2']) await expect(outlineTikzSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds}"/>`, async () => font)).rejects.toThrow('bounds');
  });
});
