import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import type { Direction } from './converter';
import { parseRichMarkdown, serializeRichBlock, type SourcePosition } from './rich-editor-markdown';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { MathBlock, MathInline, MarkdownLengthLimit, RawBlock, RawInline, RichCodeBlock, RichListItem, sourceAnnotations } from './rich-editor-extensions';
import { RichToolbar } from './RichToolbar';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import './editable-preview.css';

type Props = {
  markdown: string; direction: Direction; fontFamily: string; fontSize: number;
  onChange: (markdown: string) => void; onStartWriting: () => void;
};

export const EditablePreview = memo(function EditablePreview({ markdown, direction, fontFamily, fontSize, onChange, onStartWriting }: Props) {
  const onChangeRef = useRef(onChange);
  const applied = useRef(markdown);
  const source = useRef(markdown);
  const directionRef = useRef(direction);
  const latestMarkdown = useRef(markdown);
  const externalSyncVersion = useRef(0);
  const annotationFrame = useRef(0);
  const preservedBlocks = useRef(new Map<string, string[]>());
  const blockSnapshots = useRef(new WeakMap<ProseMirrorNode, { text: string; fingerprint: string }>());
  const cachedEditor = useRef<Editor | null>(null);
  const serialization = useRef<{ doc: ProseMirrorNode | null; text: string; positions: SourcePosition[] }>({ doc: null, text: '', positions: [] });
  const externalPositions = useRef<SourcePosition[] | null>(null);
  const [initial] = useState(() => parseRichMarkdown(markdown));
  onChangeRef.current = onChange;
  directionRef.current = direction;
  latestMarkdown.current = markdown;
  const documentSnapshot = useCallback((doc: ProseMirrorNode) => {
    if (serialization.current.doc === doc) return serialization.current;
    const blocks: string[] = [];
    const positions: SourcePosition[] = [];
    const occurrences = new Map<string, number>();
    let offset = 0;
    doc.forEach(node => {
      let block = blockSnapshots.current.get(node);
      if (!block) {
        const json = node.toJSON();
        const fingerprint = JSON.stringify(json);
        const occurrence = occurrences.get(fingerprint) || 0;
        block = { fingerprint, text: preservedBlocks.current.get(fingerprint)?.[occurrence] ?? serializeRichBlock(json) };
        blockSnapshots.current.set(node, block);
      }
      occurrences.set(block.fingerprint, (occurrences.get(block.fingerprint) || 0) + 1);
      blocks.push(block.text);
      positions.push({ start: offset, end: offset + block.text.length });
      offset += block.text.length + 2;
    });
    const text = blocks.join('\n\n');
    serialization.current = { doc, text, positions };
    return serialization.current;
  }, []);
  const serializeDocument = useCallback((doc: ProseMirrorNode) => documentSnapshot(doc).text, [documentSnapshot]);
  const sourcePositions = useCallback((doc: ProseMirrorNode) => externalPositions.current || documentSnapshot(doc).positions, [documentSnapshot]);
  const preserveSources = useCallback((editor: Editor, value: string, positions: SourcePosition[]) => {
    preservedBlocks.current = new Map();
    blockSnapshots.current = new WeakMap();
    let index = 0;
    editor.state.doc.forEach(node => {
      const span = positions[index++];
      if (span) {
        const fingerprint = JSON.stringify(node.toJSON());
        const variants = preservedBlocks.current.get(fingerprint) || [];
        const text = value.slice(span.start, span.end);
        variants.push(text);
        preservedBlocks.current.set(fingerprint, variants);
        blockSnapshots.current.set(node, { text, fingerprint });
      }
    });
    serialization.current = { doc: editor.state.doc, text: value, positions };
  }, []);
  const annotate = useCallback((editor: Editor) => {
    if (editor.isDestroyed) return;
    // Node decorations survive ProseMirror redraws and do not become edits.
    editor.view.updateState(editor.state);
  }, []);
  const scheduleAnnotation = useCallback((editor: Editor) => {
    cancelAnimationFrame(annotationFrame.current);
    annotationFrame.current = requestAnimationFrame(() => annotate(editor));
  }, [annotate]);
  const extensions = useMemo(() => [
      StarterKit.configure({ codeBlock: false, listItem: false, underline: false, trailingNode: false,
        link: { openOnClick: false, autolink: false, HTMLAttributes: { class: 'preview-link' } } }),
      RichCodeBlock, RichListItem, TableKit.configure({ table: { resizable: false, renderWrapper: true } }),
      MathInline, MathBlock, RawInline, RawBlock, MarkdownLengthLimit.configure({ serialize: serializeDocument }),
      sourceAnnotations(sourcePositions, () => directionRef.current),
    ], [serializeDocument, sourcePositions]);
  const editor = useEditor({
    extensions,
    shouldRerenderOnTransaction: false,
    content: initial.document,
    editorProps: {
      attributes: { class: 'prose rich-document', role: 'textbox', 'aria-label': 'ویرایش پیش‌نمایش', 'aria-multiline': 'true', spellcheck: 'false' },
    },
    onCreate: ({ editor }) => scheduleAnnotation(editor),
    onUpdate: ({ editor }) => {
      externalSyncVersion.current++;
      const next = serializeDocument(editor.state.doc);
      applied.current = next;
      source.current = next;
      onChangeRef.current(next);
    },
  });

  useLayoutEffect(() => {
    if (editor && cachedEditor.current !== editor) {
      preserveSources(editor, source.current, initial.positions);
      cachedEditor.current = editor;
    }
  }, [editor, initial.positions, preserveSources]);

  useLayoutEffect(() => {
    const version = ++externalSyncVersion.current;
    if (!editor || markdown === applied.current) return;
    let active = true;
    // React node views use flushSync when they mount. Replacing the document
    // must run after React's current commit, and stale queued updates must not
    // overwrite a newer draft or a rich-editor transaction.
    queueMicrotask(() => {
      if (!active || editor.isDestroyed || version !== externalSyncVersion.current
        || markdown !== latestMarkdown.current || markdown === applied.current) return;
      source.current = markdown;
      applied.current = markdown;
      const parsed = parseRichMarkdown(markdown);
      externalPositions.current = parsed.positions;
      try {
        editor.commands.setContent(parsed.document, { emitUpdate: false });
        preserveSources(editor, markdown, parsed.positions);
      } finally { externalPositions.current = null; }
      scheduleAnnotation(editor);
    });
    return () => { active = false; };
  }, [markdown, editor, scheduleAnnotation, preserveSources]);
  useLayoutEffect(() => {
    if (!editor) return;
    editor.view.dom.dir = direction === 'auto' ? 'auto' : direction;
    editor.view.dom.style.fontSize = `${fontSize + 2}px`;
    editor.view.dom.style.fontFamily = `"${fontFamily}", Vazirmatn, "ParsiWord Symbols", sans-serif`;
    scheduleAnnotation(editor);
  }, [editor, direction, fontFamily, fontSize, scheduleAnnotation]);
  useEffect(() => () => cancelAnimationFrame(annotationFrame.current), []);

  return <>
    {editor && <RichToolbar editor={editor} />}
    <article className="editable-preview-content" data-empty={!markdown.trim()}><EditorContent editor={editor} />
      {!markdown.trim() && <Empty className="rich-empty"><EmptyHeader><EmptyTitle>هنوز چیزی ننوشته‌ای.</EmptyTitle><EmptyDescription>اینجا بنویس یا از ویرایش Markdown شروع کن.</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" variant="outline" onClick={onStartWriting}>شروع نوشتن</Button></EmptyContent></Empty>}
    </article>
    <p className="preview-disclaimer">اینجا مستقیماً ویرایش کن؛ تغییرات در Markdown ذخیره می‌شوند. صفحه‌بندی نهایی را در Word بررسی کن.</p>
  </>;
});
