import { useLocale } from './locale';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import type { Direction } from './document-model';
import { parseRichMarkdown, type SourcePosition } from './rich-editor-markdown';
import { RichSourceDocument, replaceRichSourceState } from './rich-source';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { MathBlock, MathInline, MarkdownLengthLimit, RawBlock, RawInline, ReferenceMetadata, RichCodeBlock, RichListItem, sourceAnnotations } from './rich-editor-extensions';
import { RichToolbar } from './RichToolbar';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import './editable-preview.css';
import type { DiffSide } from './markdown-diff';
import { browserImageUrl, markdownImage } from './markdown-image';
import './markdown-image.css';
import { ImageResolverContext } from './image-resource';

type Props = {
  markdown: string; direction: Direction; fontFamily: string; fontSize: number;
  onChange: (markdown: string) => void; onStartWriting: () => void;
  onCompositionChange?: (composing: boolean) => void;
  onRejected?: (code: 'FILE_TOO_LARGE') => void;
  readOnly?: boolean;
  showReadOnlyToolbar?: boolean;
  inheritedDefinitions?: ReadonlyMap<string, { url?: string; title?: string | null }>;
  diff?: DiffSide;
  onEditor?: (editor: Editor | null) => void;
  resolveImage?: (source: string) => Promise<string | null>;
};

export const EditablePreview = memo(function EditablePreview({ markdown, direction, fontFamily, fontSize, onChange, onStartWriting, onCompositionChange, onRejected, readOnly = false, diff, onEditor, resolveImage, inheritedDefinitions, showReadOnlyToolbar = false }: Props) {
  const { t } = useLocale();
  const onChangeRef = useRef(onChange);
  const applied = useRef(markdown);
  const source = useRef(markdown);
  const directionRef = useRef(direction);
  const diffRef = useRef(diff);
  const latestMarkdown = useRef(markdown);
  const externalSyncVersion = useRef(0);
  const annotationFrame = useRef(0);
  const ledger = useRef(new RichSourceDocument());
  const compositionChange = useRef(onCompositionChange);
  const rejected = useRef(onRejected);
  const cachedEditor = useRef<Editor | null>(null);
  const imageResolver = useRef(resolveImage);
  const externalPositions = useRef<SourcePosition[] | null>(null);
  const [initial] = useState(() => parseRichMarkdown(markdown, inheritedDefinitions));
  onChangeRef.current = onChange;
  compositionChange.current = onCompositionChange;
  rejected.current = onRejected;
  directionRef.current = direction;
  diffRef.current = diff;
  latestMarkdown.current = markdown;
  imageResolver.current = resolveImage;
  const documentSnapshot = useCallback((doc: ProseMirrorNode) => ledger.current.snapshot(doc), []);
  const sourcePositions = useCallback((doc: ProseMirrorNode) => externalPositions.current || (cachedEditor.current ? documentSnapshot(doc).positions : initial.positions), [documentSnapshot, initial.positions]);
  const preserveSources = useCallback((editor: Editor, value: string, parsed: ReturnType<typeof parseRichMarkdown>) => {
    ledger.current.reset(editor.state.doc, value, parsed.positions, parsed.definitions);
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
      MathInline, MathBlock, RawInline.configure({
        resolveImage: source => imageResolver.current ? imageResolver.current(source) : Promise.resolve(browserImageUrl(source)),
        describeImage: source => markdownImage(source, cachedEditor.current ? ledger.current.snapshot(cachedEditor.current.state.doc).definitions : initial.definitions),
      }), RawBlock, ReferenceMetadata.configure({ refresh: state => ledger.current.refreshReferences(state) }),
      MarkdownLengthLimit.configure({ snapshot: (transaction, state) => {
        if (cachedEditor.current === null) ledger.current.reset(transaction.before, source.current, initial.positions, initial.definitions);
        return { previous: ledger.current.snapshot(transaction.before).text, next: ledger.current.prepare(transaction, state).text };
      }, onRejected: code => rejected.current?.(code) }),
      sourceAnnotations(sourcePositions, () => directionRef.current, () => diffRef.current),
    ], [sourcePositions, initial]);
  const editor = useEditor({
    extensions,
    shouldRerenderOnTransaction: false,
    editable: !readOnly,
    content: initial.document,
    editorProps: {
      attributes: { class: 'prose rich-document', role: 'textbox', 'aria-label': t("ویرایش پیش‌نمایش"), 'aria-multiline': 'true', spellcheck: 'false' },
      handleDOMEvents: {
        compositionstart: () => { compositionChange.current?.(true); return false; },
        compositionend: () => { compositionChange.current?.(false); return false; },
      },
    },
    onCreate: ({ editor }) => scheduleAnnotation(editor),
    onUpdate: ({ editor }) => {
      externalSyncVersion.current++;
      const next = ledger.current.commit(editor.state.doc, editor.state).text;
      applied.current = next;
      source.current = next;
      onChangeRef.current(next);
    },
  });

  useLayoutEffect(() => {
    if (editor && cachedEditor.current !== editor) {
      preserveSources(editor, source.current, initial);
      cachedEditor.current = editor;
    }
  }, [editor, initial, preserveSources]);

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
        editor.view.updateState(replaceRichSourceState(editor.state, parsed.document));
        preserveSources(editor, markdown, parsed);
      } finally { externalPositions.current = null; }
      scheduleAnnotation(editor);
    });
    return () => { active = false; };
  }, [markdown, editor, scheduleAnnotation, preserveSources]);
  useLayoutEffect(() => {
    if (!editor) return;
    editor.view.dom.dir = direction === 'auto' ? 'auto' : direction;
    editor.view.dom.style.fontSize = `${(fontSize + 2) / parseFloat(getComputedStyle(document.documentElement).fontSize)}rem`;
    editor.view.dom.style.fontFamily = `"${fontFamily}", Vazirmatn, "ParsiWord Symbols", sans-serif`;
    scheduleAnnotation(editor);
  }, [editor, direction, fontFamily, fontSize, scheduleAnnotation]);
  useEffect(() => {
    if (editor) editor.view.dom.setAttribute('aria-label', t(readOnly ? 'پیش‌نمایش' : 'ویرایش پیش‌نمایش'));
  }, [editor, t, readOnly]);
  useEffect(() => { editor?.setEditable(!readOnly, false); editor?.view.dom.setAttribute('aria-readonly', String(readOnly)); }, [editor, readOnly]);
  useLayoutEffect(() => { if (editor) scheduleAnnotation(editor); }, [editor, diff, scheduleAnnotation]);
  useEffect(() => () => cancelAnimationFrame(annotationFrame.current), []);
  useEffect(() => { onEditor?.(editor); return () => onEditor?.(null); }, [editor, onEditor]);

  return <>
    {editor && (!readOnly || showReadOnlyToolbar) && <RichToolbar editor={editor} readOnly={readOnly} />}
    <ImageResolverContext.Provider value={resolveImage}><article className="editable-preview-content" data-empty={!markdown.trim()}><EditorContent editor={editor} />
      {!markdown.trim() && <Empty className="rich-empty"><EmptyHeader><EmptyTitle>{t("هنوز چیزی ننوشته‌ای.")}</EmptyTitle><EmptyDescription>{t(readOnly ? 'برای نوشتن، ویرایش Markdown را باز کن.' : 'اینجا بنویس یا از ویرایش Markdown شروع کن.')}</EmptyDescription></EmptyHeader><EmptyContent><Button type="button" variant="outline" onClick={onStartWriting}>{t("شروع نوشتن")}</Button></EmptyContent></Empty>}
    </article></ImageResolverContext.Provider>
    <p className="preview-disclaimer">{t(readOnly ? 'پیش‌نمایش متن است؛ صفحه‌بندی و نمایش نهایی را در Word بررسی کن.' : 'اینجا مستقیماً ویرایش کن؛ تغییرات در Markdown ذخیره می‌شوند. صفحه‌بندی نهایی را در Word بررسی کن.')}</p>
  </>;
});
