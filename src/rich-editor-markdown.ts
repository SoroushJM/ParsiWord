import type { JSONContent } from '@tiptap/core';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkStringify from 'remark-stringify';
import type { Root } from 'mdast';

declare module 'mdast' {
  interface RawMarkdown extends Literal { type: 'rawMarkdown'; }
  interface RootContentMap { rawMarkdown: RawMarkdown; }
  interface PhrasingContentMap { rawMarkdown: RawMarkdown; }
}

type MarkdownNode = {
  type: string; value?: string; children?: MarkdownNode[]; depth?: number;
  ordered?: boolean; start?: number | null; checked?: boolean | null;
  lang?: string | null; meta?: string | null; url?: string; title?: string | null; alt?: string | null;
  identifier?: string; align?: ('left' | 'right' | 'center' | null)[];
  position?: { start: { offset?: number }; end: { offset?: number } };
};
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
const writer = unified().use(remarkGfm).use(remarkMath).use(remarkStringify, {
  bullet: '-', fences: true, emphasis: '*', strong: '*', listItemIndent: 'one',
  handlers: { rawMarkdown: node => String((node as unknown as { value: string }).value) },
});

export function parseRichMarkdown(source: string) {
  const root = parser.parse(source) as unknown as MarkdownNode;
  const definitions = new Map((root.children || []).filter(n => n.type === 'definition').map(n => [n.identifier, n]));
  const raw = (node: MarkdownNode) => source.slice(node.position?.start.offset || 0, node.position?.end.offset || 0);
  const text = (value: string, marks: JSONContent['marks'] = []): JSONContent[] => value ? [{ type: 'text', text: value, ...(marks.length ? { marks } : {}) }] : [];
  function inline(nodes: MarkdownNode[] = [], marks: JSONContent['marks'] = []): JSONContent[] {
    return nodes.flatMap(node => {
      switch (node.type) {
        case 'text': return text(node.value || '', marks);
        case 'strong': return inline(node.children, [...marks, { type: 'bold' }]);
        case 'emphasis': return inline(node.children, [...marks, { type: 'italic' }]);
        case 'delete': return inline(node.children, [...marks, { type: 'strike' }]);
        case 'inlineCode': return text(node.value || '', [...marks, { type: 'code' }]);
        case 'inlineMath': return [{ type: 'mathInline', attrs: { source: node.value || '' }, marks }];
        case 'break': return [{ type: 'hardBreak' }];
        case 'html': return /^<br\s*\/?\s*>$/i.test(node.value || '') ? [{ type: 'hardBreak' }] : [{ type: 'rawInline', attrs: { source: raw(node), label: raw(node) }, marks }];
        case 'link': return inline(node.children, [...marks, { type: 'link', attrs: { href: node.url, title: node.title } }]);
        case 'linkReference': {
          const definition = definitions.get(node.identifier);
          return definition ? inline(node.children, [...marks, { type: 'link', attrs: { href: definition.url, title: definition.title } }]) : text(raw(node), marks);
        }
        case 'image': return [{ type: 'rawInline', attrs: { source: raw(node), label: `تصویر: ${node.alt || 'بدون عنوان'} (خروجی تصویر پشتیبانی نمی‌شود)` }, marks }];
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
      case 'code': return { type: 'codeBlock', attrs: { language: node.lang || null, meta: node.meta || null }, content: text(node.value || '') };
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
  };
}

// remark-stringify understands the same GFM/math grammar as the converter.
// In particular it escapes literal dollars and line-leading #/-/1. correctly;
// the generic rich-editor serializer would turn those into new syntax.
export function serializeRichBlock(node: JSONContent): string {
  type Out = { type: string; [key: string]: unknown };
  const inlines = (nodes: JSONContent[] = []): Out[] => nodes.flatMap(child => {
    let result: Out;
    if (child.type === 'hardBreak') result = { type: 'break' };
    else if (child.type === 'mathInline') result = { type: 'inlineMath', value: child.attrs?.source || '' };
    else if (child.type === 'rawInline') result = { type: 'rawMarkdown', value: child.attrs?.source || '' };
    else if (child.type === 'text') {
      result = { type: child.marks?.some(mark => mark.type === 'code') ? 'inlineCode' : 'text', value: child.text || '' };
    } else return [];
    for (const mark of [...(child.marks || [])].reverse()) {
      const type = { bold: 'strong', italic: 'emphasis', strike: 'delete', link: 'link' }[mark.type];
      if (type) result = { type, children: [result], ...(mark.type === 'link' ? { url: mark.attrs?.href || '', title: mark.attrs?.title || null } : {}) };
    }
    return [result];
  });
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
      case 'table': return {
        type: 'table', align: item.content?.[0]?.content?.map(cell => cell.attrs?.align || null) || [],
        children: (item.content || []).map(row => ({ type: 'tableRow', children: (row.content || []).map(cell => ({
          type: 'tableCell', children: (cell.content || []).flatMap((paragraph, index) => [...(index ? [{ type: 'html', value: '<br>' }] : []), ...inlines(paragraph.content).map(child => child.type === 'break' ? { type: 'html', value: '<br>' } : child)]),
        })) })),
      };
      default: return { type: 'paragraph', children: inlines(item.content) };
    }
  }
  return writer.stringify({ type: 'root', children: [block(node)] } as unknown as Root).trimEnd();
}
