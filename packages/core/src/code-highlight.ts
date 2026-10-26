import hljs from 'highlight.js/lib/common';
import latex from 'highlight.js/lib/languages/latex';
import { DOMParser, type Element, type Node } from '@xmldom/xmldom';
import { isTikzLanguage } from './tikz-language';

export type CodeToken = { text: string; color: string; bold?: boolean; italic?: boolean; scope?: string };
export type HighlightedCode = { language?: string; label: string; lines: CodeToken[][] };
const baseColor = '24292F';
const styles: Record<string, Omit<CodeToken, 'text' | 'scope'>> = {
  keyword: { color: 'CF222E' }, literal: { color: '0550AE' }, number: { color: '0550AE' },
  string: { color: '0A3069' }, regexp: { color: '0A3069' }, char: { color: '0A3069' },
  comment: { color: '57606A', italic: true }, quote: { color: '57606A', italic: true },
  title: { color: '8250DF' }, section: { color: '0550AE', bold: true },
  name: { color: '116329' }, 'selector-tag': { color: '116329' },
  type: { color: '953800' }, 'built_in': { color: '953800' }, variable: { color: '953800' },
  attr: { color: '0550AE' }, attribute: { color: '0550AE' }, symbol: { color: '0550AE' },
  meta: { color: '953800' }, 'selector-class': { color: '8250DF' }, 'selector-id': { color: '8250DF' },
  addition: { color: '116329' }, deletion: { color: '82071E' },
  strong: { color: baseColor, bold: true }, emphasis: { color: baseColor, italic: true },
  bullet: { color: '0550AE' }, code: { color: '0A3069' },
};

export const supportedCodeLanguages = hljs.listLanguages().map(id => ({
  id, name: hljs.getLanguage(id)?.name || id,
  aliases: hljs.getLanguage(id)?.aliases || [],
})).sort((a, b) => a.id.localeCompare(b.id));
const aliases = new Map(supportedCodeLanguages.flatMap(language =>
  [language.id, ...language.aliases].map(alias => [alias.toLowerCase(), language] as const)));
const cache = new Map<string, HighlightedCode>();
// Keep diagram syntax separate from the existing general-purpose code catalog.
const tikzSyntax = hljs.newInstance();
tikzSyntax.registerLanguage('latex', latex);

/** One tokenization supplies both React text nodes and editable Word runs. */
export function highlightCode(source: string, language?: string | null): HighlightedCode {
  const requested = (language || '').trim().toLowerCase();
  const drawing = isTikzLanguage(requested);
  const grammar = drawing ? { id: 'latex', name: 'TikZ' } : aliases.get(requested);
  const label = grammar?.name || requested || 'Code';
  const plain = (): HighlightedCode => ({ language: grammar?.id, label,
    lines: source.split('\n').map(text => [{ text, color: baseColor }]),
  });
  // Unknown/unspecified languages remain literal. Avoid running grammars on
  // enormous blocks; their complete source still exports as editable text.
  if (!grammar || grammar.id === 'plaintext' || source.length > 50_000) return plain();
  const key = grammar.id + '\0' + source;
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const html = (drawing ? tikzSyntax : hljs).highlight(source, { language: grammar.id, ignoreIllegals: true }).value;
    const root = new DOMParser().parseFromString(`<code>${html}</code>`, 'application/xml').documentElement;
    if (!root) return plain();
    const tokens: CodeToken[] = [];
    function walk(node: Node, style: Omit<CodeToken, 'text'>) {
      if (node.nodeType === 3) tokens.push({ ...style, text: node.nodeValue || '' });
      else {
        const classes = node.nodeType === 1 ? (node as Element).getAttribute('class')?.split(/\s+/) || [] : [];
        const scope = classes.find(name => name.startsWith('hljs-'))?.slice(5);
        const next = scope ? { ...style, ...styles[scope], scope } : style;
        for (const child of Array.from(node.childNodes)) walk(child, next);
      }
    }
    walk(root, { color: baseColor });
    // HTML entity decoding, nested scopes and punctuation must never change code.
    if (tokens.map(token => token.text).join('') !== source) return plain();
    const lines: CodeToken[][] = [[]];
    for (const token of tokens) token.text.split('\n').forEach((text, index) => {
      if (index) lines.push([]);
      if (text) lines[lines.length - 1].push({ ...token, text });
    });
    const result = { language: grammar.id, label, lines };
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
    return result;
  } catch { return plain(); }
}
