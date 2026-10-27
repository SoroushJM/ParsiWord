import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { gfmAutolinkLiteralFromMarkdown } from 'mdast-util-gfm-autolink-literal';
import { mathLanguage } from './rich-content';
import { isTikzLanguage } from './tikz-language';
import type { Definition, Root } from 'mdast';
function positionedAutolinks(this: ReturnType<typeof unified>) {
  // mdast-util-gfm-autolink-literal's fallback transform runs on already
  // decoded text: it re-links escaped URLs and emits nodes without positions.
  // Keep its micromark tokenizer (including normal bare URLs), but make source
  // escapes authoritative instead of applying that second text-only pass.
  const fallback = gfmAutolinkLiteralFromMarkdown().transforms?.[0];
  if (!fallback) throw new Error('Unsupported GFM autolink extension: missing decoded-text transform');
  const extensions = this.data().fromMarkdownExtensions as { transforms?: unknown[] }[][] | undefined;
  let removed = 0;
  const visit = (extension: unknown): void => {
    if (Array.isArray(extension)) { extension.forEach(visit); return; }
    const item = extension as { transforms?: unknown[] };
    if (item?.transforms) item.transforms = item.transforms.filter(transform => { if (transform === fallback) { removed++; return false; } return true; });
  };
  extensions?.forEach(visit);
  if (removed !== 1) throw new Error(`Unsupported GFM autolink extension: expected one decoded-text transform, found ${removed}`);
}
export const markdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(positionedAutolinks);
export const flowingText = (text: string) => text.replace(/\r\n?|\n/g, ' ');
export function collectDefinitions<T extends { url?: string; title?: string | null } = Definition>(root: { type: string; children?: readonly unknown[] }, inherited?: ReadonlyMap<string, T>) {
  const definitions = new Map<string, T>();
  inherited?.forEach((definition, identifier) => definitions.set(identifier.toLowerCase(), definition));
  const collect = (node: { type: string; children?: readonly unknown[] }) => {
    if (node.type === 'definition') {
      const definition = node as Definition;
      if (!definitions.has(definition.identifier.toLowerCase())) definitions.set(definition.identifier.toLowerCase(), definition as unknown as T);
    }
    node.children?.forEach(child => collect(child as Parameters<typeof collect>[0]));
  };
  collect(root);
  return definitions;
}
export function markdownContext(source: string) {
  const root = markdownParser.parse(source) as Root;
  const definitions = collectDefinitions(root);
  return { source, root, definitions };
}
export type MarkdownContext = ReturnType<typeof markdownContext>;
export function documentFontUsage(markdown: string | Root) {
  const usage = { code: false, math: false };
  function visit(node: { type: string; lang?: string | null; value?: string; children?: readonly unknown[] }) {
    if (node.type === 'math' || node.type === 'inlineMath' || node.type === 'code' && mathLanguage(node.lang) && !isTikzLanguage(node.lang, node.value)) usage.math = true;
    else if (node.type === 'inlineCode' || node.type === 'code' && node.lang?.toLowerCase() !== 'mermaid' && !isTikzLanguage(node.lang, node.value)) usage.code = true;
    node.children?.forEach(child => visit(child as Parameters<typeof visit>[0]));
  }
  visit(typeof markdown === 'string' ? markdownParser.parse(markdown) : markdown);
  return usage;
}
