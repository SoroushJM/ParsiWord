import { useState } from 'react';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { CodeBlock } from '@tiptap/extension-code-block';
import { ListItem } from '@tiptap/extension-list';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { MathView, MermaidView } from './RichPreview';
import { highlightCode } from './code-highlight';
import { mathLanguage } from './rich-content';
import { paragraphDirection, type Direction } from './converter';
import { parseRichMarkdown } from './rich-editor-markdown';

function CodeBlockView({ node }: NodeViewProps) {
  const language = String(node.attrs.language || '');
  const diagram = language.toLowerCase() === 'mermaid';
  const math = mathLanguage(language);
  const code = highlightCode(node.textContent, language);
  return <NodeViewWrapper className={diagram || math ? 'rich-source-block' : 'code-block'} dir="ltr" data-language={code.language || ''}>
    {diagram || math ? <>
      <div contentEditable={false}>{diagram ? <MermaidView source={node.textContent} /> : <MathView source={node.textContent} display />}</div>
      <details className="rich-source-details"><summary contentEditable={false}>{diagram ? 'ویرایش نمودار' : 'ویرایش فرمول'}</summary><pre><NodeViewContent<'code'> as="code" /></pre></details>
    </> : <><figcaption contentEditable={false}>{code.label}</figcaption><pre><NodeViewContent<'code'> as="code" /></pre></>}
  </NodeViewWrapper>;
}

export const RichCodeBlock = CodeBlock.extend({
  addAttributes() { return { ...this.parent?.(), meta: { default: null, rendered: false } }; },
  addNodeView() { return ReactNodeViewRenderer(CodeBlockView); },
  addProseMirrorPlugins() {
    let previousDoc: ProseMirrorNode | undefined;
    let cached = DecorationSet.empty;
    return [...(this.parent?.() || []), new Plugin({
      props: {
        decorations(state) {
          if (state.doc === previousDoc) return cached;
          const decorations: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name !== 'codeBlock' || mathLanguage(node.attrs.language) || node.attrs.language === 'mermaid') return;
            let offset = pos + 1;
            const lines = highlightCode(node.textContent, node.attrs.language).lines;
            lines.forEach((line, index) => {
              if (index) offset++;
              for (const token of line) {
                if (token.scope && token.text.length) decorations.push(Decoration.inline(offset, offset + token.text.length, {
                  'data-scope': token.scope,
                  style: `color:#${token.color};${token.bold ? 'font-weight:700;' : ''}${token.italic ? 'font-style:italic;' : ''}`,
                }));
                offset += token.text.length;
              }
            });
            return false;
          });
          previousDoc = state.doc;
          cached = DecorationSet.create(state.doc, decorations);
          return cached;
        },
      },
    })];
  },
});

function MathNodeView({ node, updateAttributes }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const display = node.type.name === 'mathBlock';
  const Tag = display ? 'div' : 'span';
  return <NodeViewWrapper as={Tag} className={display ? 'rich-math-block' : 'rich-math-inline'} contentEditable={false}>
    <button type="button" className="rich-math-button" aria-label="ویرایش فرمول" onClick={() => setEditing(value => !value)}><MathView source={String(node.attrs.source)} display={display} /></button>
    {editing && <span className="rich-math-source">{display
      ? <textarea dir="ltr" aria-label="متن فرمول LaTeX" value={String(node.attrs.source)} onChange={event => updateAttributes({ source: event.target.value })} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setEditing(false); } }} />
      : <input dir="ltr" aria-label="متن فرمول LaTeX" value={String(node.attrs.source)} onChange={event => updateAttributes({ source: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); setEditing(false); } }} />}
      <button type="button" onClick={() => setEditing(false)}>تأیید</button></span>}
  </NodeViewWrapper>;
}

export const MathInline = Node.create({
  name: 'mathInline', group: 'inline', inline: true, atom: true,
  addAttributes: () => ({ source: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-math-source]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', mergeAttributes(HTMLAttributes, { 'data-math-source': HTMLAttributes.source })],
  addNodeView() { return ReactNodeViewRenderer(MathNodeView); },
});
export const MathBlock = Node.create({
  name: 'mathBlock', group: 'block', atom: true,
  addAttributes: () => ({ source: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-math-source]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-math-source': HTMLAttributes.source })],
  addNodeView() { return ReactNodeViewRenderer(MathNodeView); },
});

function RawNodeView({ node, updateAttributes }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const inline = node.type.name === 'rawInline';
  return <NodeViewWrapper as={inline ? 'span' : 'div'} className={inline ? 'rich-raw-inline' : 'rich-raw-block'} contentEditable={false}>
    <button type="button" onClick={() => setEditing(value => !value)} aria-label="ویرایش نشانه‌گذاری">{node.attrs.label || node.attrs.source}</button>
    {editing && <textarea aria-label="نشانه‌گذاری Markdown" value={String(node.attrs.source)} onChange={event => updateAttributes({ source: event.target.value })} />}
  </NodeViewWrapper>;
}
export const RawInline = Node.create({
  name: 'rawInline', group: 'inline', inline: true, atom: true,
  addAttributes: () => ({ source: { default: '' }, label: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-raw-markdown]' }],
  renderHTML: ({ HTMLAttributes }) => ['span', { 'data-raw-markdown': '', ...HTMLAttributes }],
  addNodeView() { return ReactNodeViewRenderer(RawNodeView); },
});
export const RawBlock = Node.create({
  name: 'rawBlock', group: 'block', atom: true,
  addAttributes: () => ({ source: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-raw-markdown]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { 'data-raw-markdown': '', ...HTMLAttributes }],
  addNodeView() { return ReactNodeViewRenderer(RawNodeView); },
});

export const RichListItem = ListItem.extend({
  addAttributes() { return { ...this.parent?.(), checked: { default: null, renderHTML: attrs => attrs.checked === null ? {} : { 'data-checked': String(attrs.checked) } } }; },
});

export const MarkdownLengthLimit = Extension.create<{ serialize: (doc: ProseMirrorNode) => string }>({
  name: 'markdownLengthLimit',
  addOptions: () => ({ serialize: doc => doc.textContent }),
  addProseMirrorPlugins() {
    return [new Plugin({ filterTransaction: transaction => !transaction.docChanged
      // External Markdown has already passed the raw-character limit.
      || transaction.getMeta('preventUpdate') === true
      || this.options.serialize(transaction.doc).length <= 500_000 })];
  },
});

export function sourceAnnotations(getSource: () => string, getDirection: () => Direction) {
  let previousSource: string | undefined;
  let previousDoc: ProseMirrorNode | undefined;
  let previousDirection: Direction | undefined;
  let cached = DecorationSet.empty;
  let positions: { start: number; end: number }[] = [];
  return Extension.create({
    name: 'sourceAnnotations',
    addProseMirrorPlugins() {
      return [new Plugin({ props: { decorations(state) {
        const source = getSource();
        const direction = getDirection();
        if (source === previousSource && state.doc === previousDoc && direction === previousDirection) return cached;
        if (source !== previousSource) { positions = parseRichMarkdown(source).positions; previousSource = source; }
        const decorations: Decoration[] = [];
        let index = 0;
        state.doc.forEach((node, pos) => {
          const span = positions[index++];
          decorations.push(Decoration.node(pos, pos + node.nodeSize, {
            'data-source-start': String(span?.start ?? source.length),
            'data-source-end': String(span?.end ?? source.length),
          }));
        });
        state.doc.descendants((node, pos) => {
          if (!['paragraph', 'heading', 'listItem', 'tableCell', 'tableHeader'].includes(node.type.name)) return;
          decorations.push(Decoration.node(pos, pos + node.nodeSize, { dir: paragraphDirection(node.textContent, direction) }));
        });
        previousDoc = state.doc;
        previousDirection = direction;
        cached = DecorationSet.create(state.doc, decorations);
        return cached;
      } } })];
    },
  });
}
