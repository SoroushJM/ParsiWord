import { Children, isValidElement, useEffect, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { MathView, MermaidView } from './RichPreview';
import { mathLanguage, RichContentError } from './rich-content';
import { version as appVersion } from '../package.json';
import {
  ArrowDownToLine, ArrowLeft, Bold, BookOpen, Check, CheckCheck,
  ChevronDown, Code2, FilePlus2, FileText, FolderOpen, Heading2,
  Italic, List, LoaderCircle, Settings2, ShieldCheck, Undo2,
} from 'lucide-react';
import { defaultSettings, exportWord, paragraphDirection, safeFilename, type ExportSettings } from './converter';
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
function renderedText(value: ReactNode): string {
  return Children.toArray(value).map(child => typeof child === 'string' || typeof child === 'number'
    ? String(child)
    : isValidElement<{ children?: ReactNode; className?: string }>(child) ? (/math-(inline|display)/.test(child.props.className || '') ? '\ufffc' : renderedText(child.props.children)) : '').join('');
}
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
  } catch { /* Use a clean draft if browser storage is unavailable. */ }
  return { markdown: '', settings: defaultSettings };
}

function App() {
  const [initial] = useState(loadDraft);
  const [markdown, setMarkdown] = useState(initial.markdown);
  const [settings, setSettings] = useState(initial.settings);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [sheet, setSheet] = useState<'settings' | 'fonts' | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const input = useRef<HTMLInputElement>(null);

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
      if (file) { setPrevious(markdown); setMarkdown(file.text); update('title', file.name); setTab('edit'); }
    } catch (error) {
      setNotice({ text: String(error).includes('FILE_TOO_LARGE') ? 'برای این نسخه، متن باید کمتر از ۵۰۰ هزار نویسه باشد.' : 'باز کردن فایل انجام نشد. یک فایل متنی یا Markdown انتخاب کن.', error: true });
    }
  }

  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/u).length : 0;
  const fa = (n: number) => n.toLocaleString('fa-IR');
  const dirLabel = { rtl: 'راست‌به‌چپ', auto: 'جهت خودکار', ltr: 'چپ‌به‌راست' }[settings.direction];
  const previewDir = (children: ReactNode) => paragraphDirection(renderedText(children), settings.direction);
  const components = {
    pre: ({ children }: ComponentPropsWithoutRef<'pre'>) => {
      const rich = Children.toArray(children).some(child => isValidElement<{ className?: string }>(child) && /language-(mermaid|math|latex|tex)\b/i.test(child.props.className || ''));
      return rich ? <>{children}</> : <pre>{children}</pre>;
    },
    code: ({ className, children }: ComponentPropsWithoutRef<'code'>) => {
      const language = className?.match(/language-(\S+)/)?.[1];
      const source = String(children).replace(/\n$/, '');
      if (language?.toLowerCase() === 'mermaid') return <MermaidView source={source} />;
      if (mathLanguage(language)) return <MathView source={source} display={!className?.includes('math-inline')} />;
      return <code className={className}>{children}</code>;
    },
    p: ({ children }: ComponentPropsWithoutRef<'p'>) => <p dir={previewDir(children)}>{children}</p>,
    h1: ({ children }: ComponentPropsWithoutRef<'h1'>) => <h1 dir={previewDir(children)}>{children}</h1>,
    h2: ({ children }: ComponentPropsWithoutRef<'h2'>) => <h2 dir={previewDir(children)}>{children}</h2>,
    h3: ({ children }: ComponentPropsWithoutRef<'h3'>) => <h3 dir={previewDir(children)}>{children}</h3>,
    li: ({ children, ...rest }: ComponentPropsWithoutRef<'li'>) => <li className={rest.className} dir={previewDir(children)}>{children}</li>,
    td: ({ children }: ComponentPropsWithoutRef<'td'>) => <td dir={previewDir(children)}>{children}</td>,
    th: ({ children }: ComponentPropsWithoutRef<'th'>) => <th dir={previewDir(children)}>{children}</th>,
    a: ({ children }: ComponentPropsWithoutRef<'a'>) => <span className="preview-link">{children}</span>,
    img: ({ alt }: ComponentPropsWithoutRef<'img'>) => <span className="image-placeholder">تصویر: {alt || 'بدون عنوان'} (خروجی تصویر در این نسخه پشتیبانی نمی‌شود)</span>,
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#" onClick={e => e.preventDefault()} aria-label="پارسی‌ورد">
          <span className="brand-mark"><FileText size={23} strokeWidth={1.8} /><span /></span>
          <span className="brand-name">پارسی‌ورد<span>PARSIWORD</span></span>
        </a>
        <span className="offline-badge"><span className="status-dot" /> روی دستگاه تو</span>
      </header>

      <main>
        <section className="intro">
          <h1>متن ساده بنویس.<br /><span>مرتب تحویل بگیر.</span></h1>
          <p>Markdown تو، در یک فایل Word.<br className="mobile-break" /> با توجه به فارسی و جهت نوشتن.</p>
          <div className="intro-decoration" aria-hidden="true"><FileText size={88} strokeWidth={1} /><span className="decoration-check"><Check size={20} /></span><span className="decoration-brackets">( )</span></div>
        </section>

        <div className="workspace">
          <section className="document-panel" aria-label="ویرایش سند">
            <div className="document-heading">
              <div className="document-name"><span className="file-icon"><FileText size={19} /></span><div><label htmlFor="document-title" className="sr-only">نام سند</label><input id="document-title" value={settings.title} onChange={e => update('title', e.target.value)} maxLength={90} placeholder="نام سند" /><span>پیش‌نویس شخصی</span></div></div>
              <button className="icon-button" title="یادداشت تازه" aria-label="یادداشت تازه" onClick={() => { setPrevious(markdown); setMarkdown(''); setTab('edit'); update('title', 'یادداشت تازه'); }}><FilePlus2 size={20} /></button>
            </div>

            <div className="document-actions">
              <button onClick={importFile}><FolderOpen size={16} /> باز کردن فایل</button>
            </div>

            <div className="editor-tabs" role="tablist" aria-label="حالت نمایش">
              <button id="edit-tab" role="tab" aria-selected={tab === 'edit'} aria-controls="edit-panel" className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}><Code2 size={17} /> ویرایش متن</button>
              <button id="preview-tab" role="tab" aria-selected={tab === 'preview'} aria-controls="preview-panel" className={tab === 'preview' ? 'active' : ''} onClick={() => setTab('preview')}><BookOpen size={17} /> پیش‌نمایش</button>
              <span className="markdown-badge">Markdown</span>
            </div>

            <div id="edit-panel" role="tabpanel" aria-labelledby="edit-tab" hidden={tab !== 'edit'}>
              <div className="format-toolbar" aria-label="ابزار قالب‌بندی">
                <button title="تیتر" aria-label="درج تیتر" onClick={() => wrap('## ')}><Heading2 size={18} /></button>
                <button title="پررنگ" aria-label="درج متن پررنگ" onClick={() => wrap('**', '**')}><Bold size={17} /></button>
                <button title="مورب" aria-label="درج متن مورب" onClick={() => wrap('*', '*')}><Italic size={17} /></button>
                <span />
                <button title="فهرست" aria-label="درج فهرست" onClick={() => wrap('- ')}><List size={18} /></button>
                <button title="کد" aria-label="درج کد" onClick={() => wrap('`', '`')}><Code2 size={17} /></button>
                {previous !== null && <button className="restore-button" onClick={() => { setMarkdown(previous); setPrevious(null); }}><Undo2 size={15} /> متن قبلی</button>}
              </div>
              <textarea ref={editor} className="markdown-editor" aria-label="متن Markdown" dir={settings.direction === 'ltr' ? 'ltr' : 'auto'} value={markdown} onChange={e => setMarkdown(e.target.value)} placeholder="از اینجا شروع کن…" spellCheck={false} maxLength={500_000} />
            </div>

            <div id="preview-panel" role="tabpanel" aria-labelledby="preview-tab" hidden={tab !== 'preview'} className="preview-panel">
              {tab === 'preview' && (markdown.trim() ? <article className="prose" dir={settings.direction === 'auto' ? 'auto' : settings.direction} style={{ fontSize: `${settings.fontSize + 2}px`, fontFamily: `"${settings.fontFamily}", Vazirmatn, "ParsiWord Symbols", sans-serif` }}><Markdown remarkPlugins={[remarkGfm, remarkMath]} components={components}>{markdown}</Markdown></article> : <div className="empty-preview"><FileText size={36} /><p>هنوز چیزی ننوشته‌ای.</p><button onClick={() => setTab('edit')}>شروع نوشتن <ArrowLeft size={16} /></button></div>)}
              <p className="preview-disclaimer">پیش‌نمایش متن است؛ صفحه‌بندی و نمایش نهایی را در Word بررسی کن.</p>
            </div>

            <div className="editor-status"><span>{fa(wordCount)} واژه <span className="separator">·</span> {fa(markdown.length)} نویسه</span><span className={storageError ? 'storage-error' : ''}>{storageError ? 'ذخیرهٔ خودکار در دسترس نیست' : saved ? <><CheckCheck size={14} /> ذخیره شد</> : 'در حال ذخیره…'}</span></div>
          </section>

          <aside className="side-panel">
            <div className="direction-card"><span className="card-icon"><Settings2 size={19} /></span><div><h2>جهت درست، از ابتدا</h2><p>راست‌چین بودن با راست‌به‌چپ بودن فرق دارد. جهت متن در فایل Word هم ثبت می‌شود.</p></div><button onClick={() => setSheet('settings')}>{dirLabel}<ChevronDown size={14} /></button></div>
            <div className="privacy-note"><ShieldCheck size={18} /><span>متن تو از دستگاه خارج نمی‌شود.<br />تبدیل آفلاین؛ اینترنت فقط برای دریافت فونت جدید.</span></div>
          </aside>
        </div>
        <footer className="page-footer"><span>ساخته‌شده برای نوشتن، به زبان خودت.</span><span>نسخهٔ آزمایشی <bdi dir="ltr">{appVersion}</bdi></span></footer>
      </main>

      <div className="export-dock"><div className="export-dock-inner"><Button variant="outline" size="icon" className="size-12" aria-label="تنظیمات خروجی" onClick={() => setSheet('settings')}><Settings2 /></Button><Button size="lg" className="h-12 flex-1" onClick={convert} disabled={busy || !markdown.trim()}>{busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <ArrowDownToLine data-icon="inline-start" />}<span>{busy ? 'در حال ساخت سند…' : 'ذخیرهٔ فایل Word'}</span><span className="docx-label">.docx</span></Button></div></div>

      <input className="sr-only" ref={input} type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" onChange={async e => {
        const file = e.target.files?.[0];
        if (file) {
          if (file.size > 2_000_000) { setNotice({ text: 'حجم فایل برای این نسخه بیش از حد بزرگ است.', error: true }); }
          else { const text = await file.text(); if (text.length <= 500_000) { setPrevious(markdown); setMarkdown(text); update('title', file.name.replace(/\.(md|markdown|txt)$/i, '')); setTab('edit'); } else setNotice({ text: 'متن باید کمتر از ۵۰۰ هزار نویسه باشد.', error: true }); }
        }
        e.target.value = '';
      }} />

      <Toaster dir="rtl" position="bottom-center" theme="light" closeButton />
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
