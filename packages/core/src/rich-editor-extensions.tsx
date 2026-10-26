import { useLocale } from './locale';
import { useId, useMemo, useState } from 'react';
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { CodeBlock } from '@tiptap/extension-code-block';
import { ListItem } from '@tiptap/extension-list';
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { Plugin, PluginKey, type Transaction, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { MathView, MermaidView } from './RichPreview';
import { highlightCode } from './code-highlight';
import { mathLanguage } from './rich-content';
import { paragraphDirection, type Direction } from './document-model';
import { canApplyMarkdown } from './document-limits';
import { rawMarkdownLabel, type SourcePosition } from './rich-editor-markdown';
import { changedBlock, type DiffSide } from './markdown-diff';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

function CodeBlockView({ node, editor }: NodeViewProps) {
  const { t } = useLocale();
  const language = String(node.attrs.language || '');
  const diagram = language.toLowerCase() === 'mermaid';
  const math = mathLanguage(language);
  const source = node.textContent;
  const code = useMemo(() => highlightCode(source, language), [source, language]);
  return <NodeViewWrapper className={diagram || math ? 'rich-source-block' : 'code-block'} dir="ltr" data-language={code.language || ''}>
    {diagram || math ? <>
      <div contentEditable={false}>{diagram ? <MermaidView source={node.textContent} /> : <MathView source={node.textContent} display />}</div>
      {editor.isEditable && <details className="rich-source-details"><summary contentEditable={false}>{diagram ? t("ویرایش نمودار") : t("ویرایش فرمول")}</summary><pre><NodeViewContent<'code'> as="code" /></pre></details>}
    </> : <><figcaption contentEditable={false}>{code.label}</figcaption><pre><NodeViewContent<'code'> as="code" /></pre></>}
  </NodeViewWrapper>;
}

export const RichCodeBlock = CodeBlock.extend({
  addAttributes() { return { ...this.parent?.(), meta: { default: null, rendered: false } }; },
  addNodeView() { return ReactNodeViewRenderer(CodeBlockView); },
  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>('richCodeHighlight');
    const syntax = (node: ProseMirrorNode, pos: number) => {
      if (node.type.name !== 'codeBlock' || mathLanguage(node.attrs.language) || String(node.attrs.language).toLowerCase() === 'mermaid') return [];
      const decorations: Decoration[] = [];
      let offset = pos + 1;
      highlightCode(node.textContent, node.attrs.language).lines.forEach((line, index) => {
        if (index) offset++;
        for (const token of line) {
          if (token.scope && token.text.length) decorations.push(Decoration.inline(offset, offset + token.text.length, {
            'data-scope': token.scope,
            style: `${token.bold ? 'font-weight:700;' : ''}${token.italic ? 'font-style:italic;' : ''}`,
          }));
          offset += token.text.length;
        }
      });
      return decorations;
    };
    return [...(this.parent?.() || []), new Plugin<DecorationSet>({
      key,
      state: {
        init: (_config, state) => {
          const decorations: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'codeBlock') { for (const decoration of syntax(node, pos)) decorations.push(decoration); return false; }
          });
          return DecorationSet.create(state.doc, decorations);
        },
        apply: (transaction, previous, oldState, newState) => {
          if (!transaction.docChanged) return previous;
          let next = previous.map(transaction.mapping, transaction.doc);
          const ranges: { from: number; to: number }[] = [];
          transaction.mapping.maps.forEach((map, index) => {
            const rest = transaction.mapping.slice(index + 1);
            map.forEach((_oldStart, _oldEnd, from, to) => ranges.push({ from: rest.map(from, -1), to: rest.map(to, 1) }));
          });
          if (!ranges.length) {
            const from = oldState.doc.content.findDiffStart(newState.doc.content);
            const to = oldState.doc.content.findDiffEnd(newState.doc.content);
            if (from !== null) ranges.push({ from, to: to?.b ?? from });
          }
          const visited = new Set<number>();
          for (const range of ranges) {
            transaction.doc.nodesBetween(Math.max(0, range.from - 1), Math.min(transaction.doc.content.size, range.to + 1), (node, pos) => {
              if (!node.isTextblock) return;
              if (visited.has(pos)) return false;
              visited.add(pos);
              next = next.remove(next.find(pos, pos + node.nodeSize));
              next = next.add(transaction.doc, syntax(node, pos));
              return false;
            });
          }
          return next;
        },
      },
      props: { decorations: state => key.getState(state) },
    })];
  },
});

function MathNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const { t, dir } = useLocale();
  const [editing, setEditing] = useState(false);
  const sourceId = useId();
  const display = node.type.name === 'mathBlock';
  const Tag = display ? 'div' : 'span';
  if (!editor.isEditable) return <NodeViewWrapper as={Tag} contentEditable={false}><MathView source={String(node.attrs.source)} display={display} /></NodeViewWrapper>;
  return <NodeViewWrapper as={Tag} className={display ? 'rich-math-block' : 'rich-math-inline'} contentEditable={false}>
    {display && <MathView source={String(node.attrs.source)} display />}
    <Dialog open={editing} onOpenChange={setEditing}>
      <DialogTrigger asChild><Button type="button" variant="ghost" size="sm" className="rich-math-button h-auto max-w-full" aria-label={t("ویرایش فرمول")}>{display ? t("ویرایش فرمول") : <MathView source={String(node.attrs.source)} />}</Button></DialogTrigger>
      <DialogContent dir={dir}>
        <DialogHeader><DialogTitle>{t("ویرایش فرمول")}</DialogTitle><DialogDescription>{t("متن LaTeX را تغییر بده؛ فرمول و Markdown هم‌زمان به‌روز می‌شوند.")}</DialogDescription></DialogHeader>
        <FieldGroup>
          <Field><FieldLabel htmlFor={sourceId}>{t("متن فرمول LaTeX")}</FieldLabel>{display
            ? <Textarea id={sourceId} dir="ltr" aria-label={t("متن فرمول LaTeX")} value={String(node.attrs.source)} onChange={event => updateAttributes({ source: event.target.value })} />
            : <Input id={sourceId} dir="ltr" aria-label={t("متن فرمول LaTeX")} value={String(node.attrs.source)} onChange={event => updateAttributes({ source: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setEditing(false); } }} />}</Field>
          <Button type="button" onClick={() => setEditing(false)}>{t("تأیید")}</Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
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

function RawNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const { t, dir } = useLocale();
  const [editing, setEditing] = useState(false);
  const sourceId = useId();
  const inline = node.type.name === 'rawInline';
  const label = useMemo(() => rawMarkdownLabel(String(node.attrs.source || '')), [node.attrs.source]);
  if (!editor.isEditable) return <NodeViewWrapper as={inline ? 'span' : 'div'} contentEditable={false}>{label}</NodeViewWrapper>;
  return <NodeViewWrapper as={inline ? 'span' : 'div'} className={inline ? 'rich-raw-inline' : 'rich-raw-block'} contentEditable={false}>
    <Dialog open={editing} onOpenChange={setEditing}>
      <DialogTrigger asChild><Button type="button" variant="ghost" size="sm" className="h-auto max-w-full whitespace-normal" aria-label={t("ویرایش نشانه‌گذاری")}>{label}</Button></DialogTrigger>
      <DialogContent dir={dir}>
        <DialogHeader><DialogTitle>{t("ویرایش نشانه‌گذاری")}</DialogTitle><DialogDescription>{t("نشانه‌گذاری این بخش در Markdown حفظ می‌شود.")}</DialogDescription></DialogHeader>
        <FieldGroup>
          <Field><FieldLabel htmlFor={sourceId}>{t("نشانه‌گذاری Markdown")}</FieldLabel><Textarea id={sourceId} aria-label={t("نشانه‌گذاری Markdown")} value={String(node.attrs.source)} onChange={event => updateAttributes({ source: event.target.value })} /></Field>
          <Button type="button" onClick={() => setEditing(false)}>{t("تأیید")}</Button>
        </FieldGroup>
      </DialogContent>
    </Dialog>
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

export const ReferenceMetadata = Extension.create<{ refresh: (state: EditorState) => Transaction | null }>({
  name: 'referenceMetadata',
  addOptions: () => ({ refresh: () => null }),
  addGlobalAttributes: () => [{ types: ['link'], attributes: { reference: { default: null, rendered: false } } }],
  addProseMirrorPlugins() { return [new Plugin({ appendTransaction: (transactions, _old, state) => transactions.some(transaction => transaction.docChanged) && !transactions.some(transaction => transaction.getMeta('richSourceDerived')) ? this.options.refresh(state) : null })]; },
});

export const MarkdownLengthLimit = Extension.create<{ snapshot: (transaction: Transaction, state: EditorState) => { previous: string; next: string }; onRejected: (code: 'FILE_TOO_LARGE') => void }>({
  name: 'markdownLengthLimit',
  addOptions: () => ({ snapshot: transaction => ({ previous: transaction.before.textContent, next: transaction.doc.textContent }), onRejected: () => {} }),
  addProseMirrorPlugins() {
    return [new Plugin({ filterTransaction: (transaction, state) => !transaction.docChanged
      // External Markdown has already passed the raw-character limit.
      || transaction.getMeta('preventUpdate') === true
      || (() => { const { previous, next } = this.options.snapshot(transaction, state); const allowed = canApplyMarkdown(previous, next); if (!allowed) this.options.onRejected('FILE_TOO_LARGE'); return allowed; })() })];
  },
});

export function sourceAnnotations(getPositions: (doc: ProseMirrorNode) => SourcePosition[], getDirection: () => Direction, getDiff: () => DiffSide | undefined = () => undefined) {
  let previousPositions: SourcePosition[] | undefined;
  let previousDoc: ProseMirrorNode | undefined;
  let previousDirection: Direction | undefined;
  let previousDiff: DiffSide | undefined;
  let cached = DecorationSet.empty;
  const directions = new WeakMap<ProseMirrorNode, { mode: Direction; direction: string }>();
  return Extension.create({
    name: 'sourceAnnotations',
    addProseMirrorPlugins() {
      return [new Plugin({ props: { decorations(state) {
        const positions = getPositions(state.doc);
        const direction = getDirection();
        const diff = getDiff();
        if (positions === previousPositions && state.doc === previousDoc && direction === previousDirection && diff === previousDiff) return cached;
        const end = positions[positions.length - 1]?.end || 0;
        const decorations: Decoration[] = [];
        let index = 0;
        state.doc.forEach((node, pos) => {
          const span = positions[index++];
          decorations.push(Decoration.node(pos, pos + node.nodeSize, {
            'data-source-start': String(span?.start ?? end),
            'data-source-end': String(span?.end ?? end),
            'data-diff': changedBlock(diff, span?.start ?? end, span?.end ?? end) ?? '',
          }));
        });
        state.doc.descendants((node, pos) => {
          if (!['paragraph', 'heading', 'listItem', 'tableCell', 'tableHeader'].includes(node.type.name)) return;
          let entry = directions.get(node);
          if (!entry || entry.mode !== direction) {
            entry = { mode: direction, direction: paragraphDirection(node.textContent, direction) };
            directions.set(node, entry);
          }
          decorations.push(Decoration.node(pos, pos + node.nodeSize, { dir: entry.direction }));
        });
        previousDoc = state.doc;
        previousPositions = positions;
        previousDirection = direction;
        previousDiff = diff;
        cached = DecorationSet.create(state.doc, decorations);
        return cached;
      } } })];
    },
  });
}
