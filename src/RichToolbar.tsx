import { memo, useState, type ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Code2, SquareCode, Undo2, Redo2, Link2, Table2, Sigma, RemoveFormatting, IndentIncrease, IndentDecrease } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import './rich-toolbar.css';

function FormatToggle({ label, active, action, children }: {
  label: string; active: boolean; action: () => void; children: ReactNode;
}) {
  return <Toggle className="size-10 shrink-0" title={label} aria-label={label} pressed={active}
    onMouseDown={event => event.preventDefault()} onPressedChange={action}>{children}</Toggle>;
}

function FormatButton({ label, disabled = false, action, children }: {
  label: string; disabled?: boolean; action: () => void; children: ReactNode;
}) {
  return <Button type="button" variant="ghost" size="icon-lg" className="size-10" title={label} aria-label={label} disabled={disabled}
    onMouseDown={event => event.preventDefault()} onClick={action}>{children}</Button>;
}

export const RichToolbar = memo(function RichToolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const state = useEditorState({ editor, selector: ({ editor }) => ({
    heading: editor.isActive('heading') ? String(editor.getAttributes('heading').level) : 'paragraph',
    bold: editor.isActive('bold'), italic: editor.isActive('italic'), strike: editor.isActive('strike'),
    bulletList: editor.isActive('bulletList'), orderedList: editor.isActive('orderedList'),
    blockquote: editor.isActive('blockquote'), code: editor.isActive('code'), codeBlock: editor.isActive('codeBlock'),
    table: editor.isActive('table'), canIndent: editor.can().sinkListItem('listItem'), canOutdent: editor.can().liftListItem('listItem'),
    canUndo: editor.can().undo(), canRedo: editor.can().redo(),
  }) });
  const historyBoundary = () => editor.view.dispatch(closeHistory(editor.state.tr));
  const setLink = () => {
    const href = url.trim();
    if (href && !/^(https?:\/\/|mailto:|tel:|#)/i.test(href)) { setLinkError('پیوند باید با https://، http://، mailto:، tel: یا # شروع شود.'); return; }
    historyBoundary();
    if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    else editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false); setLinkError('');
  };
  return <div className="rich-toolbar-container rich-editor-toolbar" onClickCapture={event => {
    const button = (event.target as HTMLElement).closest('button');
    if (button && !['واگرد', 'انجام دوباره'].includes(button.getAttribute('aria-label') || '')) historyBoundary();
  }}>
    <div className="rich-format-toolbar" role="toolbar" aria-label="ابزار ویرایش پیش‌نمایش">
      <FieldGroup className="rich-heading-field gap-0"><Field>
        <FieldLabel className="sr-only" htmlFor="rich-heading">سبک پاراگراف</FieldLabel>
        <Select dir="rtl" value={state.heading} onValueChange={value => {
          historyBoundary();
          if (value === 'paragraph') editor.chain().focus().setParagraph().run();
          else editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
        }}><SelectTrigger id="rich-heading" aria-label="سبک پاراگراف" className="h-10 w-28"><SelectValue /></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="paragraph">متن عادی</SelectItem>{[1, 2, 3, 4, 5, 6].map(level => <SelectItem value={String(level)} key={level}>تیتر {level.toLocaleString('fa-IR')}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field></FieldGroup>
      <FormatToggle label="پررنگ" active={state.bold} action={() => editor.chain().focus().toggleBold().run()}><Bold data-icon="inline-start" /></FormatToggle>
      <FormatToggle label="مورب" active={state.italic} action={() => editor.chain().focus().toggleItalic().run()}><Italic data-icon="inline-start" /></FormatToggle>
      <FormatToggle label="خط‌خورده" active={state.strike} action={() => editor.chain().focus().toggleStrike().run()}><Strikethrough data-icon="inline-start" /></FormatToggle>
      <FormatToggle label="فهرست بولت‌دار" active={state.bulletList} action={() => editor.chain().focus().toggleBulletList().run()}><List data-icon="inline-start" /></FormatToggle>
      <FormatToggle label="فهرست شماره‌دار" active={state.orderedList} action={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered data-icon="inline-start" /></FormatToggle>
      <FormatButton label="افزایش تورفتگی فهرست" disabled={!state.canIndent} action={() => editor.chain().focus().sinkListItem('listItem').run()}><IndentIncrease data-icon="inline-start" className="rtl:rotate-180" /></FormatButton>
      <FormatButton label="کاهش تورفتگی فهرست" disabled={!state.canOutdent} action={() => editor.chain().focus().liftListItem('listItem').run()}><IndentDecrease data-icon="inline-start" className="rtl:rotate-180" /></FormatButton>
      <FormatToggle label="نقل‌قول" active={state.blockquote} action={() => editor.chain().focus().toggleBlockquote().run()}><Quote data-icon="inline-start" /></FormatToggle>
      <FormatToggle label="کد درون متن" active={state.code} action={() => editor.chain().focus().toggleCode().run()}><Code2 data-icon="inline-start" /></FormatToggle>
      <FormatToggle label="بلوک کد" active={state.codeBlock} action={() => editor.chain().focus().toggleCodeBlock().run()}><SquareCode data-icon="inline-start" /></FormatToggle>
      <Button type="button" variant="ghost" size="icon-lg" className="size-10" title="درج یا ویرایش پیوند" aria-label="درج یا ویرایش پیوند" aria-expanded={linkOpen} aria-controls="rich-link-tools"
        onMouseDown={event => event.preventDefault()} onClick={() => { setUrl(editor.getAttributes('link').href || ''); setLinkOpen(value => !value); }}><Link2 data-icon="inline-start" /></Button>
      <FormatButton label="درج جدول" action={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 data-icon="inline-start" /></FormatButton>
      <FormatButton label="درج فرمول" action={() => editor.chain().focus().insertContent({ type: 'mathInline', attrs: { source: 'x^2' } }).run()}><Sigma data-icon="inline-start" /></FormatButton>
      <FormatButton label="پاک کردن قالب‌بندی" action={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting data-icon="inline-start" /></FormatButton>
      <FormatButton label="واگرد" disabled={!state.canUndo} action={() => editor.chain().focus().undo().run()}><Undo2 data-icon="inline-start" /></FormatButton>
      <FormatButton label="انجام دوباره" disabled={!state.canRedo} action={() => editor.chain().focus().redo().run()}><Redo2 data-icon="inline-start" /></FormatButton>
    </div>
    {state.table && <div className="rich-table-tools" role="group" aria-label="ابزار جدول">
      <Button type="button" variant="outline" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>افزودن ردیف</Button>
      <Button type="button" variant="outline" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>افزودن ستون</Button>
      <Button type="button" variant="outline" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}>حذف ردیف</Button>
      <Button type="button" variant="outline" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()}>حذف ستون</Button>
      <Button type="button" variant="outline" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().deleteTable().run()}>حذف جدول</Button>
    </div>}
    {linkOpen && <FieldGroup id="rich-link-tools" className="rich-link-tools gap-2">
      <Field data-invalid={!!linkError}><FieldLabel htmlFor="rich-link-url">نشانی پیوند</FieldLabel>
        <Input id="rich-link-url" dir="ltr" value={url} aria-invalid={!!linkError} aria-describedby={linkError ? 'rich-link-error' : undefined}
          onChange={event => { setUrl(event.target.value); setLinkError(''); }} placeholder="https://example.com"
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setLink(); } if (event.key === 'Escape') setLinkOpen(false); }} />
        {linkError && <FieldError id="rich-link-error">{linkError}</FieldError>}
      </Field>
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={setLink}>ثبت پیوند</Button><Button type="button" variant="outline" size="sm" onClick={() => setLinkOpen(false)}>بستن</Button></div>
    </FieldGroup>}
  </div>;
});
