import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Code2, SquareCode, Undo2, Redo2, Link2, Table2, Sigma, RemoveFormatting } from 'lucide-react';
import type { Direction } from './converter';
import { parseRichMarkdown, serializeRichBlock } from './rich-editor-markdown';
import { closeHistory } from '@tiptap/pm/history';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { MathBlock, MathInline, MarkdownLengthLimit, RawBlock, RawInline, RichCodeBlock, RichListItem, sourceAnnotations } from './rich-editor-extensions';
import './editable-preview.css';

type Props = {
  markdown: string; direction: Direction; fontFamily: string; fontSize: number;
  onChange: (markdown: string) => void; onStartWriting: () => void;
};

function FormatButton({ label, active = false, disabled = false, action, children }: {
  label: string; active?: boolean; disabled?: boolean; action: () => void; children: React.ReactNode;
}) {
  return <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled}
    onMouseDown={event => event.preventDefault()} onClick={action}>{children}</button>;
}

function RichToolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const heading = editor.getAttributes('heading').level as number | undefined;
  const setLink = () => {
    const href = url.trim();
    if (href && !/^(https?:\/\/|mailto:|tel:|#)/i.test(href)) { setLinkError('پیوند باید با https://، http://، mailto: یا # شروع شود.'); return; }
    if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    else editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false); setLinkError('');
  };
  const historyBoundary = () => editor.view.dispatch(closeHistory(editor.state.tr));
  return <div className="rich-toolbar-container rich-editor-toolbar" onClickCapture={event => {
    const button = (event.target as HTMLElement).closest('button');
    if (button && !['واگرد', 'انجام دوباره'].includes(button.getAttribute('aria-label') || '')) historyBoundary();
  }}>
    <div className="rich-format-toolbar" role="toolbar" aria-label="ابزار ویرایش پیش‌نمایش">
      <label className="sr-only" htmlFor="rich-heading">سبک پاراگراف</label>
      <select id="rich-heading" aria-label="سبک پاراگراف" value={heading ? String(heading) : 'paragraph'} onChange={event => {
        historyBoundary();
        const value = event.target.value;
        if (value === 'paragraph') editor.chain().focus().setParagraph().run();
        else editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
      }}><option value="paragraph">متن عادی</option>{[1, 2, 3, 4, 5, 6].map(level => <option value={level} key={level}>تیتر {level.toLocaleString('fa-IR')}</option>)}</select>
      <FormatButton label="پررنگ" active={editor.isActive('bold')} action={() => editor.chain().focus().toggleBold().run()}><Bold size={17} /></FormatButton>
      <FormatButton label="مورب" active={editor.isActive('italic')} action={() => editor.chain().focus().toggleItalic().run()}><Italic size={17} /></FormatButton>
      <FormatButton label="خط‌خورده" active={editor.isActive('strike')} action={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={17} /></FormatButton>
      <FormatButton label="فهرست بولت‌دار" active={editor.isActive('bulletList')} action={() => editor.chain().focus().toggleBulletList().run()}><List size={18} /></FormatButton>
      <FormatButton label="فهرست شماره‌دار" active={editor.isActive('orderedList')} action={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={18} /></FormatButton>
      <FormatButton label="افزایش تورفتگی فهرست" disabled={!editor.can().sinkListItem('listItem')} action={() => editor.chain().focus().sinkListItem('listItem').run()}><span className="rich-indent-icon">⇥</span></FormatButton>
      <FormatButton label="کاهش تورفتگی فهرست" disabled={!editor.can().liftListItem('listItem')} action={() => editor.chain().focus().liftListItem('listItem').run()}><span className="rich-indent-icon">⇤</span></FormatButton>
      <FormatButton label="نقل‌قول" active={editor.isActive('blockquote')} action={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={17} /></FormatButton>
      <FormatButton label="کد درون متن" active={editor.isActive('code')} action={() => editor.chain().focus().toggleCode().run()}><Code2 size={18} /></FormatButton>
      <FormatButton label="بلوک کد" active={editor.isActive('codeBlock')} action={() => editor.chain().focus().toggleCodeBlock().run()}><SquareCode size={18} /></FormatButton>
      <FormatButton label="درج یا ویرایش پیوند" active={editor.isActive('link')} action={() => { setUrl(editor.getAttributes('link').href || ''); setLinkOpen(value => !value); }}><Link2 size={17} /></FormatButton>
      <FormatButton label="درج جدول" action={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={17} /></FormatButton>
      <FormatButton label="درج فرمول" action={() => editor.chain().focus().insertContent({ type: 'mathInline', attrs: { source: 'x^2' } }).run()}><Sigma size={17} /></FormatButton>
      <FormatButton label="پاک کردن قالب‌بندی" action={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting size={17} /></FormatButton>
      <FormatButton label="واگرد" disabled={!editor.can().undo()} action={() => editor.chain().focus().undo().run()}><Undo2 size={17} /></FormatButton>
      <FormatButton label="انجام دوباره" disabled={!editor.can().redo()} action={() => editor.chain().focus().redo().run()}><Redo2 size={17} /></FormatButton>
    </div>
    {editor.isActive('table') && <div className="rich-table-tools" role="group" aria-label="ابزار جدول">
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>افزودن ردیف</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>افزودن ستون</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}>حذف ردیف</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()}>حذف ستون</button>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().deleteTable().run()}>حذف جدول</button>
    </div>}
    {linkOpen && <div className="rich-link-tools">
      <label htmlFor="rich-link-url">نشانی پیوند</label><input id="rich-link-url" dir="ltr" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com" onKeyDown={event => { if (event.key === 'Enter') setLink(); if (event.key === 'Escape') setLinkOpen(false); }} />
      <button type="button" onClick={setLink}>ثبت پیوند</button><button type="button" onClick={() => setLinkOpen(false)}>بستن</button>
      {linkError && <p role="alert">{linkError}</p>}
    </div>}
  </div>;
}

export function EditablePreview({ markdown, direction, fontFamily, fontSize, onChange, onStartWriting }: Props) {
  const onChangeRef = useRef(onChange);
  const applied = useRef(markdown);
  const source = useRef(markdown);
  const directionRef = useRef(direction);
  const latestMarkdown = useRef(markdown);
  const externalSyncVersion = useRef(0);
  const annotationFrame = useRef(0);
  const preservedBlocks = useRef(new Map<string, string[]>());
  const cachedEditor = useRef<Editor | null>(null);
  const serialization = useRef<{ doc: ProseMirrorNode | null; text: string }>({ doc: null, text: '' });
  const [initialDocument] = useState(() => parseRichMarkdown(markdown).document);
  const [revision, setRevision] = useState(0);
  onChangeRef.current = onChange;
  directionRef.current = direction;
  latestMarkdown.current = markdown;
  const serializeDocument = useCallback((doc: ProseMirrorNode) => {
    if (serialization.current.doc === doc) return serialization.current.text;
    const blocks: string[] = [];
    const occurrences = new Map<string, number>();
    doc.forEach(node => {
      const json = node.toJSON();
      const fingerprint = JSON.stringify(json);
      const occurrence = occurrences.get(fingerprint) || 0;
      occurrences.set(fingerprint, occurrence + 1);
      blocks.push(preservedBlocks.current.get(fingerprint)?.[occurrence] ?? serializeRichBlock(json));
    });
    const text = blocks.join('\n\n');
    serialization.current = { doc, text };
    return text;
  }, []);
  const preserveSources = useCallback((editor: Editor, value: string) => {
    const { positions } = parseRichMarkdown(value);
    preservedBlocks.current = new Map();
    let index = 0;
    editor.state.doc.forEach(node => {
      const span = positions[index++];
      if (span) {
        const fingerprint = JSON.stringify(node.toJSON());
        const variants = preservedBlocks.current.get(fingerprint) || [];
        variants.push(value.slice(span.start, span.end));
        preservedBlocks.current.set(fingerprint, variants);
      }
    });
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
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, listItem: false, underline: false, trailingNode: false,
        link: { openOnClick: false, autolink: false, HTMLAttributes: { class: 'preview-link' } } }),
      RichCodeBlock, RichListItem, TableKit.configure({ table: { resizable: false, renderWrapper: true } }),
      MathInline, MathBlock, RawInline, RawBlock, MarkdownLengthLimit.configure({ serialize: serializeDocument }),
      sourceAnnotations(() => source.current, () => directionRef.current),
    ],
    content: initialDocument,
    editorProps: {
      attributes: { class: 'prose rich-document', role: 'textbox', 'aria-label': 'ویرایش پیش‌نمایش', 'aria-multiline': 'true', spellcheck: 'false' },
    },
    onCreate: ({ editor }) => { preserveSources(editor, source.current); scheduleAnnotation(editor); },
    onUpdate: ({ editor }) => {
      externalSyncVersion.current++;
      const next = serializeDocument(editor.state.doc);
      applied.current = next;
      source.current = next;
      onChangeRef.current(next);
      setRevision(value => value + 1);
      scheduleAnnotation(editor);
    },
    onSelectionUpdate: () => setRevision(value => value + 1),
  });

  useLayoutEffect(() => {
    if (editor && cachedEditor.current !== editor) {
      preserveSources(editor, source.current);
      cachedEditor.current = editor;
    }
  }, [editor, preserveSources]);

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
      editor.commands.setContent(parseRichMarkdown(markdown).document, { emitUpdate: false });
      preserveSources(editor, markdown);
      scheduleAnnotation(editor);
      setRevision(value => value + 1);
    });
    return () => { active = false; };
  }, [markdown, editor, scheduleAnnotation, preserveSources]);
  useLayoutEffect(() => {
    if (!editor) return;
    editor.view.dom.dir = direction === 'auto' ? 'auto' : direction;
    editor.view.dom.style.fontSize = `${fontSize + 2}px`;
    editor.view.dom.style.fontFamily = `"${fontFamily}", Vazirmatn, "ParsiWord Symbols", sans-serif`;
    scheduleAnnotation(editor);
  }, [editor, direction, fontFamily, fontSize, revision, scheduleAnnotation]);
  useEffect(() => () => cancelAnimationFrame(annotationFrame.current), []);

  return <>
    {editor && <RichToolbar editor={editor} />}
    <article className="editable-preview-content" data-empty={!markdown.trim()}><EditorContent editor={editor} />
      {!markdown.trim() && <div className="empty-preview rich-empty"><p>اینجا بنویس یا از ویرایش Markdown شروع کن.</p><button type="button" onClick={onStartWriting}>شروع نوشتن</button></div>}
    </article>
    <p className="preview-disclaimer">اینجا مستقیماً ویرایش کن؛ تغییرات در Markdown ذخیره می‌شوند. صفحه‌بندی نهایی را در Word بررسی کن.</p>
  </>;
}
