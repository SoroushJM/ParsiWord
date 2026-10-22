import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { DocumentPreview } from './DocumentPreview';
import { RichContentError } from './rich-content';
import defaultDocument from './default-document.md?raw';
import { version as appVersion } from '../package.json';
import {
  ArrowDownToLine, Bold, BookOpen, Check, CheckCheck,
  ChevronDown, Code2, FilePlus2, FileText, FolderOpen, Heading2,
  Italic, List, LoaderCircle, Settings2, ShieldCheck, Undo2,
} from 'lucide-react';
import { defaultSettings, exportWord, safeFilename, type ExportSettings } from './converter';
import { openMarkdown, saveDocx } from './files';
import { FontPicker } from './FontPicker';
import { activateFont, documentFonts, fontError, normalizeFontFamily } from './fonts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';

const storageKey = 'parsiword-draft-v1';
function loadDraft() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const data = JSON.parse(raw);
      if (typeof data.markdown === 'string' && data.markdown.length <= 500_000) {
        const s = data.settings || {};
        return {
          markdown: data.markdown,
          settings: {
            title: typeof s.title === 'string' ? s.title.slice(0, 90) : defaultSettings.title,
            direction: ['rtl', 'ltr', 'auto'].includes(s.direction) ? s.direction : 'rtl',
            fontSize: [10, 11, 12, 14, 16, 18].includes(s.fontSize) ? s.fontSize : 12,
            alignmentOnly: false,
            fontFamily: typeof s.fontFamily === 'string' ? normalizeFontFamily(s.fontFamily.slice(0, 100)) : defaultSettings.fontFamily,
          } as ExportSettings,
        };
      }
    }
  } catch { /* Use the starter document if no valid saved draft is available. */ }
  return { markdown: defaultDocument, settings: defaultSettings };
}

function App() {
  const [initial] = useState(loadDraft);
  const [markdown, setMarkdown] = useState(initial.markdown);
  const [settings, setSettings] = useState(initial.settings);
  const [previewMarkdown, setPreviewMarkdown] = useState(initial.markdown);
  const [sheet, setSheet] = useState<'settings' | 'fonts' | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const focusEditor = useCallback(() => editor.current?.focus(), []);
  const resizeEditor = useCallback(() => {
    const element = editor.current;
    if (!element) return;
    const scroll = window.scrollY;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
    element.scrollTop = 0;
    if (window.scrollY !== scroll) window.scrollTo(0, scroll);
  }, []);
  useLayoutEffect(resizeEditor, [markdown, resizeEditor]);
  useEffect(() => {
    const element = editor.current;
    if (!element) return;
    let width = element.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const next = element.getBoundingClientRect().width;
      if (next !== width) { width = next; resizeEditor(); }
    });
    observer.observe(element);
    let active = true;
    document.fonts.ready.then(() => { if (active) resizeEditor(); });
    return () => { active = false; observer.disconnect(); };
  }, [resizeEditor]);

  useEffect(() => {
    const timer = setTimeout(() => setPreviewMarkdown(markdown), 200);
    return () => clearTimeout(timer);
  }, [markdown]);
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let dispose: (() => void) | undefined;
    let active = true;
    import('./dev-capture').then(({ installCapture }) => { if (active) dispose = installCapture(setMarkdown); });
    return () => { active = false; dispose?.(); };
  }, []);

  useEffect(() => {
    setSaved(false);
    const timer = setTimeout(() => {
      try { localStorage.setItem(storageKey, JSON.stringify({ markdown, settings })); setSaved(true); setStorageError(false); }
      catch { setStorageError(true); }
    }, 500);
    return () => clearTimeout(timer);
  }, [markdown, settings]);

  useEffect(() => {
    if (!notice) return;
    if (notice.error) toast.error(notice.text); else toast.success(notice.text);
    setNotice(null);
  }, [notice]);

  useEffect(() => {
    let active = true;
    documentFonts(settings.fontFamily).then(fonts => {
      if (active) return Promise.all(fonts.map(activateFont));
    }).catch(error => { if (active) setNotice({ text: fontError(error), error: true }); });
    return () => { active = false; };
  }, [settings.fontFamily]);

  function update<K extends keyof ExportSettings>(key: K, value: ExportSettings[K]) {
    setSettings(s => ({ ...s, [key]: value }));
  }

  function wrap(before: string, after = '') {
    const el = editor.current;
    if (!el) return;
    const start = el.selectionStart; const end = el.selectionEnd;
    const selected = markdown.slice(start, end);
    setMarkdown(markdown.slice(0, start) + before + selected + after + markdown.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + before.length, end + before.length); });
  }

  async function convert() {
    if (!markdown.trim() || busy) return;
    setBusy(true);
    try {
      const fonts = await documentFonts(settings.fontFamily, markdown);
      const bytes = await exportWord(markdown, settings, fonts);
      if (await saveDocx(bytes, safeFilename(settings.title))) {
        setNotice({ text: 'فایل Word آماده شد و ذخیره شد.' });
      }
    } catch (error) {
      console.error('DOCX export failed', error);
      setNotice({ text: error instanceof RichContentError ? error.message : String(error).includes('FONT_') ? fontError(error) : 'ذخیرهٔ فایل انجام نشد. فضای خالی و محل ذخیره را بررسی کن و دوباره امتحان کن.', error: true });
    } finally { setBusy(false); }
  }

  async function importFile() {
    if (!isTauri()) { input.current?.click(); return; }
    try {
      const file = await openMarkdown();
      if (file) { setPrevious(markdown); setMarkdown(file.text); update('title', file.name); }
    } catch (error) {
      setNotice({ text: String(error).includes('FILE_TOO_LARGE') ? 'برای این نسخه، متن باید کمتر از ۵۰۰ هزار نویسه باشد.' : 'باز کردن فایل انجام نشد. یک فایل متنی یا Markdown انتخاب کن.', error: true });
    }
  }

  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/u).length : 0;
  const fa = (n: number) => n.toLocaleString('fa-IR');
  const dirLabel = { rtl: 'راست‌به‌چپ', auto: 'جهت خودکار', ltr: 'چپ‌به‌راست' }[settings.direction];

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="پارسی‌ورد">
          <span className="brand-mark"><FileText size={23} strokeWidth={1.8} /><span /></span>
          <span className="brand-name">پارسی‌ورد<span>PARSIWORD</span></span>
        </a>
      </header>

      <main>
        <section className="intro">
          <h1>متن ساده بنویس.<br /><span>مرتب تحویل بگیر.</span></h1>
          <div className="intro-controls">
            <Select dir="rtl" value={settings.direction} onValueChange={value => update('direction', value as ExportSettings['direction'])}>
              <SelectTrigger aria-label="جهت متن" className="direction-trigger"><Settings2 size={15} /><SelectValue>{dirLabel}</SelectValue></SelectTrigger>
              <SelectContent><SelectGroup><SelectItem value="auto">جهت خودکار</SelectItem><SelectItem value="rtl">راست‌به‌چپ</SelectItem><SelectItem value="ltr">چپ‌به‌راست</SelectItem></SelectGroup></SelectContent>
            </Select>
          </div>
          <p>Markdown تو، در یک فایل Word.<br className="mobile-break" /> با توجه به فارسی و جهت نوشتن.</p>
        </section>

        <div className="workspace">
          <section className="document-panel" aria-label="ویرایش سند">
            <div className="document-heading">
              <div className="document-name"><span className="file-icon"><FileText size={19} /></span><div><label htmlFor="document-title" className="sr-only">نام سند</label><input id="document-title" value={settings.title} onChange={e => update('title', e.target.value)} maxLength={90} placeholder="نام سند" /><span>پیش‌نویس شخصی</span></div></div>
              <div className="document-tools">
                <div className="document-actions"><button onClick={importFile}><FolderOpen size={16} /> باز کردن فایل</button></div>
                <button className="icon-button" title="یادداشت تازه" aria-label="یادداشت تازه" onClick={() => { setPrevious(markdown); setMarkdown(''); update('title', 'یادداشت تازه'); focusEditor(); }}><FilePlus2 size={20} /></button>
              </div>
              <div className="document-export">
                <Button variant="outline" size="icon" className="size-12" aria-label="تنظیمات خروجی" onClick={() => setSheet('settings')}><Settings2 /></Button>
                <Button size="lg" className="h-12 flex-1" onClick={convert} disabled={busy || !markdown.trim()}>{busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ArrowDownToLine data-icon="inline-start" />}<span>{busy ? 'در حال ساخت سند…' : 'ذخیرهٔ فایل Word'}</span><span className="docx-label">.docx</span></Button>
              </div>
            </div>

            <div className="live-workspace">
            <section id="edit-panel" className="editing-pane" aria-labelledby="edit-heading">
              <div className="pane-heading"><h2 id="edit-heading"><Code2 size={17} /> ویرایش متن</h2><span>Markdown</span></div>
              <div className="format-toolbar" role="toolbar" aria-label="ابزار قالب‌بندی">
                <button title="تیتر" aria-label="درج تیتر" onClick={() => wrap('## ')}><Heading2 size={18} /></button>
                <button title="پررنگ" aria-label="درج متن پررنگ" onClick={() => wrap('**', '**')}><Bold size={17} /></button>
                <button title="مورب" aria-label="درج متن مورب" onClick={() => wrap('*', '*')}><Italic size={17} /></button>
                <span />
                <button title="فهرست" aria-label="درج فهرست" onClick={() => wrap('- ')}><List size={18} /></button>
                <button title="کد" aria-label="درج کد" onClick={() => wrap('`', '`')}><Code2 size={17} /></button>
                {previous !== null && <button className="restore-button" onClick={() => { setMarkdown(previous); setPrevious(null); }}><Undo2 size={15} /> متن قبلی</button>}
              </div>
              <textarea ref={editor} className="markdown-editor" aria-label="متن Markdown" dir={settings.direction === 'ltr' ? 'ltr' : 'auto'} value={markdown} onChange={e => setMarkdown(e.target.value)} placeholder="از اینجا شروع کن…" spellCheck={false} maxLength={500_000} />
            </section>

            <section className="preview-pane" aria-labelledby="preview-heading">
              <div className="pane-heading"><h2 id="preview-heading"><BookOpen size={17} /> پیش‌نمایش</h2></div>
              <div id="preview-panel" className="preview-panel" aria-busy={previewMarkdown !== markdown}>
                <DocumentPreview markdown={previewMarkdown} direction={settings.direction} fontFamily={settings.fontFamily} fontSize={settings.fontSize} onStartWriting={focusEditor} />
              </div>
            </section>
            </div>

            <div className="editor-status"><span>{fa(wordCount)} واژه <span className="separator">·</span> {fa(markdown.length)} نویسه</span><span className={storageError ? 'storage-error' : ''}>{storageError ? 'ذخیرهٔ خودکار در دسترس نیست' : saved ? <><CheckCheck size={14} /> ذخیره شد</> : 'در حال ذخیره…'}</span></div>
          </section>

        </div>
        <div className="privacy-note workspace-privacy"><ShieldCheck size={16} /><span>متن تو از دستگاه خارج نمی‌شود. تبدیل آفلاین؛ اینترنت فقط برای دریافت فونت جدید.</span></div>
        <footer className="page-footer"><span>ساخته‌شده برای نوشتن، به زبان خودت.</span><span>نسخهٔ آزمایشی <bdi dir="ltr">{appVersion}</bdi></span></footer>
      </main>

      <input className="sr-only" ref={input} type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" onChange={async e => {
        const file = e.target.files?.[0];
        if (file) {
          if (file.size > 2_000_000) { setNotice({ text: 'حجم فایل برای این نسخه بیش از حد بزرگ است.', error: true }); }
          else { const text = await file.text(); if (text.length <= 500_000) { setPrevious(markdown); setMarkdown(text); update('title', file.name.replace(/\.(md|markdown|txt)$/i, '')); } else setNotice({ text: 'متن باید کمتر از ۵۰۰ هزار نویسه باشد.', error: true }); }
        }
        e.target.value = '';
      }} />

      <Toaster dir="rtl" position="bottom-center" theme="light" closeButton
        offset={{ bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', left: 24, right: 24 }}
        mobileOffset={{ bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', left: 16, right: 16 }} />
      <Dialog open={sheet !== null} onOpenChange={open => { if (!open) setSheet(null); }}>
        <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{sheet === 'fonts' ? 'انتخاب فونت' : 'تنظیمات خروجی'}</DialogTitle>
            <DialogDescription>{sheet === 'fonts' ? 'فونت‌های Google Fonts، با دانلود و نگهداری روی دستگاه' : 'جهت متن، اندازه و فونت سند Word را انتخاب کن.'}</DialogDescription>
          </DialogHeader>
          {sheet === 'settings' ? <FieldGroup>
            <Field><FieldLabel htmlFor="export-title">نام فایل</FieldLabel><Input id="export-title" value={settings.title} onChange={e => update('title', e.target.value)} maxLength={90} /></Field>
            <Field>
              <FieldLabel>جهت متن در Word</FieldLabel>
              <ToggleGroup type="single" variant="outline" value={settings.direction} onValueChange={value => { if (value) update('direction', value as ExportSettings['direction']); }} dir="rtl" aria-label="جهت متن در Word" className="w-full">
                <ToggleGroupItem value="rtl" className="flex-1">راست‌به‌چپ</ToggleGroupItem><ToggleGroupItem value="auto" className="flex-1">خودکار</ToggleGroupItem><ToggleGroupItem value="ltr" className="flex-1">چپ‌به‌راست</ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>«خودکار» جهت هر پاراگراف را جدا تشخیص می‌دهد؛ پاراگراف انگلیسی چپ‌به‌راست می‌ماند.</FieldDescription>
            </Field>
            <Field><FieldLabel>فونت خروجی</FieldLabel><Button variant="outline" className="w-full justify-between" onClick={() => setSheet('fonts')} aria-label="انتخاب فونت خروجی"><span dir="ltr">{settings.fontFamily}</span><ChevronDown data-icon="inline-end" /></Button><FieldDescription>فونت داخل فایل Word جاسازی می‌شود و همراه سند منتقل می‌شود.</FieldDescription></Field>
            <Field><FieldLabel htmlFor="font-size">اندازهٔ متن</FieldLabel><Select dir="rtl" value={String(settings.fontSize)} onValueChange={value => update('fontSize', Number(value))}><SelectTrigger id="font-size" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{[10, 11, 12, 14, 16, 18].map(n => <SelectItem key={n} value={String(n)}>{fa(n)} pt</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            <p className="text-muted-foreground text-xs leading-6">کاغذ A4 است. فرمول LaTeX در Word قابل ویرایش است؛ نمودار Mermaid به تصویر تبدیل می‌شود. تصاویر Markdown هنوز پشتیبانی نمی‌شوند.</p>
            <Button onClick={() => setSheet(null)}>آماده است <Check data-icon="inline-end" /></Button>
          </FieldGroup> : <><FontPicker value={settings.fontFamily} onSelect={family => { update('fontFamily', family); setSheet('settings'); }} /><Button variant="outline" onClick={() => setSheet('settings')}>بازگشت به تنظیمات</Button></>}

        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
