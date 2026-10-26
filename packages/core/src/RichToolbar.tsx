import { useLocale } from './locale';
import { editorHost } from './host';
import { memo, useState, type ReactNode } from 'react';
import { useEditorState, type Editor } from '@tiptap/react';
import { closeHistory } from '@tiptap/pm/history';
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Code2, SquareCode, Undo2, Redo2, Link2, Table2, Sigma, RemoveFormatting, IndentIncrease, IndentDecrease, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Input } from '@/components/ui/input';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import './rich-toolbar.css';

function FormatToggle({ label, active, action, children }: {
  label: string; active: boolean; action: () => void; children: ReactNode;
}) {
  return <Toggle className="rich-icon-control shrink-0" title={label} aria-label={label} pressed={active}
    onMouseDown={event => event.preventDefault()} onPressedChange={action}>{children}</Toggle>;
}

function FormatButton({ label, disabled = false, action, children }: {
  label: string; disabled?: boolean; action: () => void; children: ReactNode;
}) {
  return <Button type="button" variant="ghost" size="icon-lg" className="rich-icon-control" title={label} aria-label={label} disabled={disabled}
    onMouseDown={event => event.preventDefault()} onClick={action}>{children}</Button>;
}

export const RichToolbar = memo(function RichToolbar({ editor, readOnly = false }: { editor: Editor; readOnly?: boolean }) {
  const { t, dir, number } = useLocale();
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
  const headingLabel = state.heading === 'paragraph' ? t("متن عادی") : `${t('تیتر')} ${number(Number(state.heading))}`;
  const historyBoundary = () => editor.view.dispatch(closeHistory(editor.state.tr));
  const setLink = () => {
    const href = url.trim();
    if (href && !/^(https?:\/\/|mailto:|tel:|#)/i.test(href)) { setLinkError(t("پیوند باید با https://، http://، mailto:، tel: یا # شروع شود.")); return; }
    historyBoundary();
    if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    else editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkOpen(false); setLinkError('');
  };
  return <fieldset disabled={readOnly} className="rich-toolbar-container rich-editor-toolbar" onClickCapture={event => {
    const button = (event.target as HTMLElement).closest('button');
    if (button && ![t("واگرد"), t("انجام دوباره")].includes(button.getAttribute('aria-label') || '')) historyBoundary();
  }}>
    <div className="rich-format-toolbar" role="toolbar" aria-label={t("ابزار ویرایش پیش‌نمایش")}
      onFocusCapture={event => {
        if (editorHost().kind === 'vscode') {
          // Chromium can leave a partially visible Tab target clipped by this
          // narrow horizontal scroller. Keep its control and focus ring visible.
          (event.target as HTMLElement).scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        }
      }}>
      <FieldGroup className="rich-heading-field gap-0"><Field>
        <FieldLabel className="sr-only" htmlFor="rich-heading">{t("سبک پاراگراف")}</FieldLabel>
        <Select dir={dir} value={state.heading} onValueChange={value => {
          historyBoundary();
          if (value === 'paragraph') editor.chain().focus().setParagraph().run();
          else editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 | 4 | 5 | 6 }).run();
        }}><SelectTrigger id="rich-heading" aria-label={t("سبک پاراگراف")} aria-describedby="rich-heading-value" title={`${t('سبک پاراگراف')}: ${headingLabel}`} className="rich-icon-control justify-center px-0 [&>svg:last-child]:hidden"><Type aria-hidden="true" /><span className="sr-only"><SelectValue id="rich-heading-value" /></span></SelectTrigger>
          <SelectContent><SelectGroup><SelectItem value="paragraph">{t("متن عادی")}</SelectItem>{[1, 2, 3, 4, 5, 6].map(level => <SelectItem value={String(level)} key={level}>{t('تیتر')} {number(level)}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </Field></FieldGroup>
      <FormatToggle label={t("پررنگ")} active={state.bold} action={() => editor.chain().focus().toggleBold().run()}><Bold data-icon="inline-start" /></FormatToggle>
      <FormatToggle label={t("مورب")} active={state.italic} action={() => editor.chain().focus().toggleItalic().run()}><Italic data-icon="inline-start" /></FormatToggle>
      <FormatToggle label={t("خط‌خورده")} active={state.strike} action={() => editor.chain().focus().toggleStrike().run()}><Strikethrough data-icon="inline-start" /></FormatToggle>
      <FormatToggle label={t("فهرست بولت‌دار")} active={state.bulletList} action={() => editor.chain().focus().toggleBulletList().run()}><List data-icon="inline-start" /></FormatToggle>
      <FormatToggle label={t("فهرست شماره‌دار")} active={state.orderedList} action={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered data-icon="inline-start" /></FormatToggle>
      <FormatButton label={t("افزایش تورفتگی فهرست")} disabled={!state.canIndent} action={() => editor.chain().focus().sinkListItem('listItem').run()}><IndentIncrease data-icon="inline-start" className="rtl:rotate-180" /></FormatButton>
      <FormatButton label={t("کاهش تورفتگی فهرست")} disabled={!state.canOutdent} action={() => editor.chain().focus().liftListItem('listItem').run()}><IndentDecrease data-icon="inline-start" className="rtl:rotate-180" /></FormatButton>
      <FormatToggle label={t("نقل‌قول")} active={state.blockquote} action={() => editor.chain().focus().toggleBlockquote().run()}><Quote data-icon="inline-start" /></FormatToggle>
      <FormatToggle label={t("کد درون متن")} active={state.code} action={() => editor.chain().focus().toggleCode().run()}><Code2 data-icon="inline-start" /></FormatToggle>
      <FormatToggle label={t("بلوک کد")} active={state.codeBlock} action={() => editor.chain().focus().toggleCodeBlock().run()}><SquareCode data-icon="inline-start" /></FormatToggle>
      <Button type="button" variant="ghost" size="icon-lg" className="rich-icon-control" title={t("درج یا ویرایش پیوند")} aria-label={t("درج یا ویرایش پیوند")} aria-expanded={linkOpen} aria-controls="rich-link-tools"
        onMouseDown={event => event.preventDefault()} onClick={() => { setUrl(editor.getAttributes('link').href || ''); setLinkOpen(value => !value); }}><Link2 data-icon="inline-start" /></Button>
      <FormatButton label={t("درج جدول")} action={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 data-icon="inline-start" /></FormatButton>
      <FormatButton label={t("درج فرمول")} action={() => editor.chain().focus().insertContent({ type: 'mathInline', attrs: { source: 'x^2' } }).run()}><Sigma data-icon="inline-start" /></FormatButton>
      <FormatButton label={t("پاک کردن قالب‌بندی")} action={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting data-icon="inline-start" /></FormatButton>
      <FormatButton label={t("واگرد")} disabled={editorHost().kind !== 'vscode' && !state.canUndo} action={() => { if (editorHost().kind === 'vscode') editorHost().command?.('undo'); else editor.chain().focus().undo().run(); }}><Undo2 data-icon="inline-start" /></FormatButton>
      <FormatButton label={t("انجام دوباره")} disabled={editorHost().kind !== 'vscode' && !state.canRedo} action={() => { if (editorHost().kind === 'vscode') editorHost().command?.('redo'); else editor.chain().focus().redo().run(); }}><Redo2 data-icon="inline-start" /></FormatButton>
    </div>
    {state.table && <div className="rich-table-tools" role="group" aria-label={t("ابزار جدول")}>
      <Button type="button" variant="outline" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().addRowAfter().run()}>{t("افزودن ردیف")}</Button>
      <Button type="button" variant="outline" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().addColumnAfter().run()}>{t("افزودن ستون")}</Button>
      <Button type="button" variant="outline" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().deleteRow().run()}>{t("حذف ردیف")}</Button>
      <Button type="button" variant="outline" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().deleteColumn().run()}>{t("حذف ستون")}</Button>
      <Button type="button" variant="outline" size="sm" onMouseDown={event => event.preventDefault()} onClick={() => editor.chain().focus().deleteTable().run()}>{t("حذف جدول")}</Button>
    </div>}
    {linkOpen && <FieldGroup id="rich-link-tools" className="rich-link-tools gap-2">
      <Field data-invalid={!!linkError}><FieldLabel htmlFor="rich-link-url">{t("نشانی پیوند")}</FieldLabel>
        <Input id="rich-link-url" dir="ltr" value={url} aria-invalid={!!linkError} aria-describedby={linkError ? 'rich-link-error' : undefined}
          onChange={event => { setUrl(event.target.value); setLinkError(''); }} placeholder="https://example.com"
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setLink(); } if (event.key === 'Escape') setLinkOpen(false); }} />
        {linkError && <FieldError id="rich-link-error">{linkError}</FieldError>}
      </Field>
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={setLink}>{t("ثبت پیوند")}</Button><Button type="button" variant="outline" size="sm" onClick={() => setLinkOpen(false)}>{t("بستن")}</Button></div>
    </FieldGroup>}
  </fieldset>;
});
