import type { JSONContent } from '@tiptap/core';
import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkStringify from 'remark-stringify';
import type { Root } from 'mdast';
import { markdownParser, flowingText, collectDefinitions } from './markdown';

declare module 'mdast' {
  interface RawMarkdown extends Literal { type: 'rawMarkdown'; }
  interface RootContentMap { rawMarkdown: RawMarkdown; }
  interface PhrasingContentMap { rawMarkdown: RawMarkdown; }
}

export type MarkdownNode = {
  type: string; value?: string; children?: MarkdownNode[]; depth?: number;
  ordered?: boolean; start?: number | null; checked?: boolean | null;
  lang?: string | null; meta?: string | null; url?: string; title?: string | null; alt?: string | null;
  identifier?: string; align?: ('left' | 'right' | 'center' | null)[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};
export type SourcePosition = { start: number; end: number };
const writer = unified().use(remarkGfm).use(remarkMath).use(remarkStringify, {
  bullet: '-', fences: true, emphasis: '*', strong: '*', listItemIndent: 'one',
  handlers: { rawMarkdown: node => String((node as unknown as { value: string }).value) },
});
export function rawMarkdownLabel(source: string): string {
  if (!/^!\[/.test(source)) return source;
  const root = markdownParser.parse(source) as unknown as MarkdownNode;
  const image = root.children?.[0]?.children?.[0];
  return image?.type === 'image' ? `تصویر: ${image.alt || 'بدون عنوان'}` : source;
}

export function parseRichMarkdown(source: string, inherited?: ReadonlyMap<string, { url?: string; title?: string | null }>) {
  // Isolated block mapping still needs the surrounding document's reference
  // labels for CommonMark to recognize linkReference nodes. Definitions added
  // for recognition are outside the source and never enter the rich document.
  const recognition = inherited?.size ? '\n\n' + [...inherited.keys()].map(identifier => `[${identifier.replace(/[\\\[\]]/g, '\\$&')}]: https://parsiword.invalid/`).join('\n') : '';
  const root = markdownParser.parse(source + recognition) as unknown as MarkdownNode;
  if (recognition) root.children = root.children?.filter(node => (node.position?.start.offset || 0) < source.length);
  // An isolated block inherits the already resolved document definitions;
  // parsing it must never replace an earlier definition from that document.
  const definitions = collectDefinitions(root, inherited);
  const raw = (node: MarkdownNode) => source.slice(node.position?.start.offset || 0, node.position?.end.offset || 0);
  const text = (value: string, marks: JSONContent['marks'] = []): JSONContent[] => value ? [{ type: 'text', text: value, ...(marks.length ? { marks } : {}) }] : [];
  function inline(nodes: MarkdownNode[] = [], marks: JSONContent['marks'] = []): JSONContent[] {
    return nodes.flatMap(node => {
      switch (node.type) {
        case 'text': return text(flowingText(node.value || ''), marks);
        case 'strong': return inline(node.children, [...marks, { type: 'bold' }]);
        case 'emphasis': return inline(node.children, [...marks, { type: 'italic' }]);
        case 'delete': return inline(node.children, [...marks, { type: 'strike' }]);
        case 'inlineCode': return text(node.value || '', [...marks, { type: 'code' }]);
        case 'inlineMath': return [{ type: 'mathInline', attrs: { source: node.value || '' }, marks }];
        case 'break': return [{ type: 'hardBreak' }];
        case 'html': return /^<br\s*\/?\s*>$/i.test(node.value || '') ? [{ type: 'hardBreak' }] : [{ type: 'rawInline', attrs: { source: raw(node), label: raw(node) }, marks }];
        case 'link': return inline(node.children, [...marks, { type: 'link', attrs: { href: node.url, title: node.title } }]);
        case 'linkReference': {
          const definition = definitions.get(node.identifier || '');
          return definition ? inline(node.children, [...marks, { type: 'link', attrs: { href: definition.url, title: definition.title, reference: node.identifier } }]) : text(raw(node), marks);
        }
        case 'image': case 'imageReference': {
          const definition = node.type === 'image' ? node : definitions.get(node.identifier || '');
          return [{ type: 'rawInline', attrs: { source: raw(node), label: `تصویر: ${node.alt || 'بدون عنوان'}`,
            image: definition?.url ? { url: definition.url, alt: node.alt || '', title: definition.title || null } : null }, marks }];
        }
        default: return [{ type: 'rawInline', attrs: { source: raw(node), label: raw(node) }, marks }];
      }
    });
  }
  function block(node: MarkdownNode): JSONContent {
    const children = () => (node.children || []).map(block);
    switch (node.type) {
      case 'paragraph': return { type: 'paragraph', content: inline(node.children) };
      case 'heading': return { type: 'heading', attrs: { level: node.depth || 1 }, content: inline(node.children) };
      case 'blockquote': return { type: 'blockquote', content: children() };
      case 'list': return { type: node.ordered ? 'orderedList' : 'bulletList', attrs: node.ordered ? { start: node.start || 1 } : undefined, content: children() };
      case 'listItem': return { type: 'listItem', attrs: { checked: node.checked ?? null }, content: children().length ? children() : [{ type: 'paragraph' }] };
      case 'code': return { type: 'codeBlock', attrs: { language: node.lang || null, meta: node.meta || null }, content: text((node.value || '').replace(/\r\n?/g, '\n')) };
      case 'math': return { type: 'mathBlock', attrs: { source: node.value || '' } };
      case 'thematicBreak': return { type: 'horizontalRule' };
      case 'table': return {
        type: 'table', content: (node.children || []).map((row, rowIndex) => ({
          type: 'tableRow', content: (row.children || []).map((cell, index) => ({
            type: rowIndex ? 'tableCell' : 'tableHeader', attrs: { align: node.align?.[index] || null },
            content: [{ type: 'paragraph', content: inline(cell.children) }],
          })),
        })),
      };
      default: return { type: 'rawBlock', attrs: { source: raw(node) } };
    }
  }
  const blocks = root.children || [];
  return {
    document: { type: 'doc', content: blocks.length ? blocks.map(block) : [{ type: 'paragraph' }] } as JSONContent,
    positions: blocks.map(node => ({ start: node.position?.start.offset || 0, end: node.position?.end.offset || 0 })),
    root,
    definitions,
  };
}

// remark-stringify understands the same GFM/math grammar as the converter.
// In particular it escapes literal dollars and line-leading #/-/1. correctly;
// the generic rich-editor serializer would turn those into new syntax.
export function serializeRichBlock(node: JSONContent): string {
  type Out = { type: string; [key: string]: unknown };
  const inlines = (nodes: JSONContent[] = []): Out[] => {
    const priority: Record<string, number> = { link: 0, bold: 1, italic: 2, strike: 3 };
    const items = nodes.flatMap(child => {
      let node: Out;
      // A Markdown line-ending break disappears at a paragraph edge. Inline
      // HTML expresses the same explicit rich break at either edge as well.
      if (child.type === 'hardBreak') node = { type: 'html', value: '<br>' };
      else if (child.type === 'mathInline') node = { type: 'inlineMath', value: child.attrs?.source || '' };
      else if (child.type === 'rawInline') node = { type: 'rawMarkdown', value: child.attrs?.source || '' };
      else if (child.type === 'text') node = { type: child.marks?.some(mark => mark.type === 'code') ? 'inlineCode' : 'text', value: child.text || '' };
      else return [];
      return [{ node, marks: (child.marks || []).filter(mark => mark.type in priority).sort((a, b) => priority[a.type] - priority[b.type]) }];
    });
    const key = (mark: NonNullable<JSONContent['marks']>[number]) => JSON.stringify([mark.type, mark.type === 'link' ? mark.attrs?.href : null, mark.type === 'link' ? mark.attrs?.title || null : null]);
    const group = (input: typeof items): Out[] => {
      const output: Out[] = [];
      for (let index = 0; index < input.length;) {
        const mark = input[index].marks[0];
        if (!mark) { output.push(input[index++].node); continue; }
        let end = index + 1;
        while (end < input.length && input[end].marks[0] && key(input[end].marks[0]) === key(mark)) end++;
        output.push({ type: ({ bold: 'strong', italic: 'emphasis', strike: 'delete', link: 'link' } as Record<string, string>)[mark.type], children: group(input.slice(index, end).map(item => ({ ...item, marks: item.marks.slice(1) }))), ...(mark.type === 'link' ? { url: mark.attrs?.href || '', title: mark.attrs?.title || null } : {}) });
        index = end;
      }
      return output;
    };
    return group(items);
  };
  function block(item: JSONContent): Out {
    const children = () => (item.content || []).map(block);
    switch (item.type) {
      case 'paragraph': return { type: 'paragraph', children: inlines(item.content) };
      case 'heading': return { type: 'heading', depth: item.attrs?.level || 1, children: inlines(item.content) };
      case 'blockquote': return { type: 'blockquote', children: children() };
      case 'bulletList': case 'orderedList': return { type: 'list', ordered: item.type === 'orderedList', start: item.attrs?.start || 1, spread: false, children: children() };
      case 'listItem': return { type: 'listItem', checked: item.attrs?.checked ?? null, spread: (item.content?.length || 0) > 1, children: children() };
      case 'codeBlock': return { type: 'code', lang: item.attrs?.language || null, meta: item.attrs?.meta || null, value: (item.content || []).map(text => text.text || '').join('') };
      case 'mathBlock': return { type: 'math', value: item.attrs?.source || '' };
      case 'horizontalRule': return { type: 'thematicBreak' };
      case 'rawBlock': return { type: 'rawMarkdown', value: item.attrs?.source || '' };
      case 'table': {
        const table = {
          type: 'table', align: item.content?.[0]?.content?.map(cell => cell.attrs?.align || null) || [],
          children: (item.content || []).map(row => ({ type: 'tableRow', children: (row.content || []).map(cell => ({
            type: 'tableCell', children: (cell.content || []).flatMap((paragraph, index) => [...(index ? [{ type: 'html', value: '<br>' }] : []), ...inlines(paragraph.content).map(child => child.type === 'break' ? { type: 'html', value: '<br>' } : child)]),
          })) })),
        };
        if (table.children.some(row => row.children.length !== table.children[0]?.children.length)) {
          // markdown-table pads every row to the widest one. Row operations
          // must retain raggedness until the explicit repair command is used.
          // Encode each row with the existing GFM/math writer (including code
          // pipes and escapes), keeping the delimiter only for the real header.
          return { type: 'rawMarkdown', value: table.children.map((row, index) => {
            const single = { ...table, align: table.align.slice(0, row.children.length), children: [row] };
            const lines = writer.stringify({ type: 'root', children: [single] } as unknown as Root).trimEnd().split('\n');
            return lines.slice(0, index === 0 ? 2 : 1).join('\n');
          }).join('\n') };
        }
        return table;
      }
      default: return { type: 'paragraph', children: inlines(item.content) };
    }
  }
  return writer.stringify({ type: 'root', children: [block(node)] } as unknown as Root).replace(/\n$/, '');
}
