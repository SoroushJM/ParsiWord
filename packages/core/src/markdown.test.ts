import { describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { markdownContext } from './markdown';
import { parseRichMarkdown, rawMarkdownLabel } from './rich-editor-markdown';

const links = (root: { type: string; children?: readonly unknown[] }): { url: string; position?: unknown }[] => {
  const found: { url: string; position?: unknown }[] = [];
  const visit = (node: typeof root & { url?: string; position?: unknown }) => {
    if (node.type === 'link') found.push({ url: node.url!, position: node.position });
    node.children?.forEach(child => visit(child as typeof node));
  };
  visit(root); return found;
};

describe('shared positioned Markdown grammar', () => {
  it.each([
    ['https://example.com/a?q=1', 'https://example.com/a?q=1'],
    ['www.example.com', 'http://www.example.com'],
    ['person@example.com', 'mailto:person@example.com'],
    ['<https://example.com/a?q=1>', 'https://example.com/a?q=1'],
    ['<person@example.com>', 'mailto:person@example.com'],
    ['[label](https://example.com)', 'https://example.com'],
  ])('keeps valid autolinks/direct links and their source positions: %s', (source, url) => {
    const found = links(markdownContext(source).root);
    expect(found).toHaveLength(1); expect(found[0].url).toBe(url); expect(found[0].position).toBeDefined();
    expect(parseRichMarkdown(source).document.content![0].content![0].marks?.[0].attrs?.href).toBe(url);
  });
  it.each(['https\\://example.com', 'https&#58;//example.com', 'h&#116;tps://example.com', 'person\\@example.com', 'www\\.example.com'])('keeps explicitly escaped/entity URLs literal: %s', source => {
    expect(links(markdownContext(source).root)).toHaveLength(0);
    expect(parseRichMarkdown(source).document.content![0].content?.every(node => !node.marks?.some(mark => mark.type === 'link'))).toBe(true);
  });
  it('resolves the first nested definition in document order using one normalization rule', () => {
    const source = '> [REF]: https://first.example "first"\n\n[ref]: https://second.example\n\n[x][ReF]';
    const context = markdownContext(source), rich = parseRichMarkdown(source);
    expect([...context.definitions.keys()]).toEqual(['ref']);
    expect(context.definitions.get('ref')?.url).toBe('https://first.example');
    expect(rich.definitions.get('ref')?.url).toBe('https://first.example');
    expect(rich.document.content![2].content![0].marks?.[0].attrs).toEqual({ href: 'https://first.example', title: 'first', reference: 'ref' });
  });
  it('flows only soft lines while preserving hard breaks, code and source spelling', () => {
    const source = 'one\r\ntwo   three\n\nfirst  \r\nsecond\\\nthird\n\n```txt\na\nb\n```';
    const parsed = parseRichMarkdown(source);
    expect(parsed.document.content![0].content).toEqual([{ type: 'text', text: 'one two   three' }]);
    expect(parsed.document.content![1].content?.filter(node => node.type === 'hardBreak')).toHaveLength(2);
    expect(parsed.document.content![2].content![0].text).toBe('a\nb');
    expect(markdownContext(source).source).toBe(source);
  });
  it('refreshes raw image labels from current source', () => {
    expect(rawMarkdownLabel('![old](image.png)')).toContain('old');
    expect(rawMarkdownLabel('![new](image.png)')).toContain('new');
    expect(rawMarkdownLabel('<strong>new</strong>')).toBe('<strong>new</strong>');
  });
  it('retains escaped-literal and normal-autolink policy after production minification', async () => {
    const result = await build({ entryPoints: ['packages/core/src/markdown.ts'], bundle: true, write: false, format: 'cjs', platform: 'node', minify: true });
    const module = { exports: {} as { markdownContext: typeof markdownContext } };
    new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, createRequire(import.meta.url));
    const production = module.exports;
    expect(links(production.markdownContext('https\\://example.com').root)).toHaveLength(0);
    expect(links(production.markdownContext('https://example.com').root)).toHaveLength(1);
  });
});
