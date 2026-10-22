import { useLocale } from './locale';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { EditablePreview } from './EditablePreview';
import { MarkdownSourceEditor } from './MarkdownSourceEditor';
import { BrandHeader, DocumentHeading, ExportSettingsDialog, IntroControls, MobileViewSwitch, SourceToolbar } from './AppControls';
import { usePreviewScroll } from './use-preview-scroll';
import { RichContentError } from './rich-content';
import defaultDocument from './default-document.md?raw';
import { version as appVersion } from '../package.json';
import { BookOpen, CheckCheck, Code2, ShieldCheck } from 'lucide-react';
import { defaultSettings, exportWord, safeFilename, type ExportSettings } from './converter';
import { openMarkdown, saveDocx, saveMarkdown, savePdf } from './files';
import { activateFont, documentFonts, fontError, normalizeFontFamily } from './fonts';
import { Badge } from '@/components/ui/badge';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource-variable/geist';

const storageKey = 'parsiword-draft-v1';
function loadDraft(locale: 'fa' | 'en') {
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
  return { markdown: defaultDocument, settings: { ...defaultSettings, title: locale === 'en' ? 'My note' : defaultSettings.title } };
}

function App() {
  const { t, dir, number, locale } = useLocale();
  const [initial] = useState(() => loadDraft(locale));
  const [markdown, setMarkdown] = useState(initial.markdown);
  const [settings, setSettings] = useState(initial.settings);
  const markdownRef = useRef(markdown);
  const settingsRef = useRef(settings);
  markdownRef.current = markdown;
  settingsRef.current = settings;
  const [editingView, setEditingView] = useState<'edit' | 'preview'>('edit');
  const editingViewRef = useRef(editingView);
  const [inactiveSource, setInactiveSource] = useState(initial.markdown);
  const [previewMarkdown, setPreviewMarkdown] = useState(initial.markdown);
  const [sheet, setSheet] = useState<'settings' | 'fonts' | null>(null);
  const [busy, setBusy] = useState(false);
  const exporting = useRef(false);
  const [saved, setSaved] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { mobileView, selectView, activateView } = usePreviewScroll(editor, preview, markdown, previewMarkdown);
  // Markdown state, export and persistence are current in the input task.
  // Only the secondary textarea's DOM value waits for a short pause. Replacing
  // its entire value on every rich keystroke makes WebView reshape all source.
  const sourceMarkdown = editingView === 'preview' && (mobileView === 'preview' || !matchMedia('(max-width: 56.1875rem)').matches)
    ? inactiveSource : markdown;
  useEffect(() => {
    if (editingView !== 'preview') return;
    const timer = setTimeout(() => setInactiveSource(markdown), 120);
    return () => clearTimeout(timer);
  }, [markdown, editingView]);
  const activateEditingView = useCallback((view: 'edit' | 'preview') => {
    if (editingViewRef.current !== view) {
      editingViewRef.current = view;
      setInactiveSource(markdownRef.current);
      setEditingView(view);
    }
    activateView(view);
  }, [activateView]);
  const onSourceFocus = useCallback(() => activateEditingView('edit'), [activateEditingView]);
  const onPreviewFocus = useCallback(() => activateEditingView('preview'), [activateEditingView]);
  const updateFromPreview = useCallback((value: string) => {
    activateEditingView('preview');
    setMarkdown(value);
    setPreviewMarkdown(value);
  }, [activateEditingView]);
  const focusEditor = useCallback(() => {
    selectView('edit');
    requestAnimationFrame(() => editor.current?.focus());
  }, [selectView]);
  const resizeEditor = useCallback(() => {
    const element = editor.current;
    if (!element?.clientWidth) return;
    const scroll = window.scrollY;
    const style = getComputedStyle(element);
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    element.style.height = 'auto';
    const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
    element.style.height = `${(element.scrollHeight + border) / rootSize}rem`;
    element.scrollTop = 0;
    if (window.scrollY !== scroll) window.scrollTo(0, scroll);
  }, []);
  useLayoutEffect(() => {
    // The hidden Markdown pane does not need layout while typing in preview.
    // On desktop, resize the secondary pane after an input burst rather than
    // forcing textarea layout before each rich-editor paint.
    if (mobileView === 'preview' && matchMedia('(max-width: 56.1875rem)').matches) return;
    const active = document.activeElement;
    if (active?.matches('input, textarea, [contenteditable="true"]') && !active.matches('.markdown-editor')) {
      const timer = setTimeout(resizeEditor, 160);
      return () => clearTimeout(timer);
    }
    resizeEditor();
  }, [markdown, mobileView, resizeEditor]);
  useEffect(() => {
    const element = editor.current;
    if (!element) return;
    let width = element.getBoundingClientRect().width;
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      const next = element.getBoundingClientRect().width;
      if (next !== width) {
        width = next;
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(resizeEditor);
      }
    });
    observer.observe(element);
    let active = true;
    document.fonts.ready.then(() => { if (active) resizeEditor(); });
    document.fonts.addEventListener('loadingdone', resizeEditor);
    return () => { active = false; cancelAnimationFrame(resizeFrame); observer.disconnect(); document.fonts.removeEventListener('loadingdone', resizeEditor); };
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
    }).catch(error => { if (active) setNotice({ text: t(fontError(error)), error: true }); });
    return () => { active = false; };
  }, [settings.fontFamily, t]);

  const update = useCallback(<K extends keyof ExportSettings,>(key: K, value: ExportSettings[K]) => {
    setSettings(s => ({ ...s, [key]: value }));
  }, []);

  const wrap = useCallback((before: string, after = '') => {
    const el = editor.current;
    if (!el) return;
    const markdown = markdownRef.current;
    const start = el.selectionStart; const end = el.selectionEnd;
    const selected = markdown.slice(start, end);
    setMarkdown(markdown.slice(0, start) + before + selected + after + markdown.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + before.length, end + before.length); });
  }, []);

  const convert = useCallback(async (format: 'docx' | 'pdf' | 'md') => {
    const markdown = markdownRef.current;
    const settings = settingsRef.current;
    if ((!markdown.trim() && format !== 'md') || exporting.current) return;
    exporting.current = true;
    setBusy(true);
    try {
      const filename = safeFilename(settings.title).replace(/\.docx$/i, `.${format}`);
      let saved: boolean;
      if (format === 'md') saved = await saveMarkdown(markdown, filename);
      else {
        const fonts = await documentFonts(settings.fontFamily, markdown);
        if (format === 'pdf') {
          const { exportPdf } = await import('./pdf-export');
          saved = await savePdf(await exportPdf(markdown, settings, fonts), filename);
        } else saved = await saveDocx(await exportWord(markdown, settings, fonts), filename);
      }
      if (saved) {
        const label = format === 'docx' ? 'Word' : format === 'md' ? 'Markdown' : 'PDF';
        setNotice({ text: locale === 'en' ? `${label} file saved.` : `فایل ${label} آماده شد و ذخیره شد.` });
      }
    } catch (error) {
      console.error(`${format.toUpperCase()} export failed`, error);
      setNotice({ text: error instanceof RichContentError ? t(error.message) : String(error).includes('FONT_') ? t(fontError(error)) : t("ذخیرهٔ فایل انجام نشد. فضای خالی و محل ذخیره را بررسی کن و دوباره امتحان کن."), error: true });
    } finally { exporting.current = false; setBusy(false); }
  }, [t, locale]);

  const importFile = useCallback(async () => {
    if (!isTauri()) { input.current?.click(); return; }
    try {
      const file = await openMarkdown();
      if (file) { setPrevious(markdownRef.current); setMarkdown(file.text); update('title', file.name); }
    } catch (error) {
      setNotice({ text: String(error).includes('FILE_TOO_LARGE') ? t("برای این نسخه، متن باید کمتر از ۵۰۰ هزار نویسه باشد.") : t("باز کردن فایل انجام نشد. یک فایل متنی یا Markdown انتخاب کن."), error: true });
    }
  }, [update, t]);

  const onDirectionChange = useCallback((direction: ExportSettings['direction']) => update('direction', direction), [update]);
  const onTitleChange = useCallback((title: string) => update('title', title), [update]);
  const onSettings = useCallback(() => setSheet('settings'), []);
  const onNew = useCallback(() => {
    setPrevious(markdownRef.current);
    setMarkdown('');
    update('title', t("یادداشت تازه"));
    focusEditor();
  }, [update, focusEditor, t]);
  const onRestore = useCallback(() => {
    if (previous !== null) { setMarkdown(previous); setPrevious(null); }
  }, [previous]);
  const onOpen = importFile;
  const onExport = useCallback(() => { void convert('docx'); }, [convert]);
  const onExportPdf = useCallback(() => { void convert('pdf'); }, [convert]);
  const onExportMarkdown = useCallback(() => { void convert('md'); }, [convert]);
  const onWrap = wrap;

  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/u).length : 0;

  return (
    <div className="app-shell">
      <BrandHeader />

      <main>
        <IntroControls direction={settings.direction} onDirectionChange={onDirectionChange} />

        <div className="workspace">
          <section className="document-panel" aria-label={t("ویرایش سند")}>
            <DocumentHeading title={settings.title} busy={busy} canExport={!!markdown.trim()} onTitleChange={onTitleChange} onOpen={onOpen} onNew={onNew} onSettings={onSettings} onExport={onExport} onExportPdf={onExportPdf} onExportMarkdown={onExportMarkdown} />

            <div className="live-workspace" data-view={mobileView}>
            <MobileViewSwitch view={mobileView} onSelect={selectView} />
            <section id="edit-panel" className="editing-pane" aria-labelledby="edit-heading">
              <div className="pane-heading"><h2 id="edit-heading"><Code2 size="1.0625rem" /> {t("ویرایش متن")}</h2><span>Markdown</span></div>
              <SourceToolbar canRestore={previous !== null} onWrap={onWrap} onRestore={onRestore} />
              <FieldGroup className="gap-0"><Field className="gap-0"><FieldLabel htmlFor="markdown-source" className="sr-only">{t("متن Markdown")}</FieldLabel><MarkdownSourceEditor editorRef={editor} value={sourceMarkdown} direction={settings.direction === 'ltr' ? 'ltr' : 'auto'} onFocus={onSourceFocus} onChange={setMarkdown} /></Field></FieldGroup>
            </section>

            <section id="preview-pane" className="preview-pane" aria-labelledby="preview-heading">
              <div className="pane-heading"><h2 id="preview-heading"><BookOpen size="1.0625rem" /> {t("پیش‌نمایش")}</h2></div>
              <div ref={preview} id="preview-panel" className="preview-panel" aria-busy={previewMarkdown !== markdown} onFocusCapture={onPreviewFocus}>
                <EditablePreview markdown={previewMarkdown} direction={settings.direction} fontFamily={settings.fontFamily} fontSize={settings.fontSize} onChange={updateFromPreview} onStartWriting={focusEditor} />
              </div>
            </section>
            </div>

            <div className="editor-status"><span>{number(wordCount)} {t("واژه")}<span className="separator">·</span> {number(markdown.length)} {t("نویسه")}</span><Badge variant={storageError ? 'destructive' : 'secondary'}>{storageError ? t("ذخیرهٔ خودکار در دسترس نیست") : saved ? <><CheckCheck data-icon="inline-start" /> {t("ذخیره شد")}</> : t("در حال ذخیره…")}</Badge></div>
          </section>

        </div>
        <div className="privacy-note workspace-privacy"><ShieldCheck size="1rem" /><span>{t("متن تو از دستگاه خارج نمی‌شود. تبدیل آفلاین؛ اینترنت فقط برای دریافت فونت جدید.")}</span></div>
        <section className="product-explanation" aria-labelledby="why-parsiword">
          <h2 id="why-parsiword">{t('چرا پارسی‌ورد؟')}</h2>
          <p>{t('دیدن و ویرایش Markdown راست‌به‌چپ نباید سخت باشد. پارسی‌ورد منبع Markdown و پیش‌نمایش قابل ویرایش را کنار هم می‌گذارد تا متن فارسی و عربی، واژه‌های انگلیسی، عددها و فرمول‌ها را در جهت مناسب بخوانی و ویرایش کنی.')}</p>
          <p>{t('در منبع Markdown یا مستقیماً در پیش‌نمایش بنویس؛ تغییرات بین هر دو هماهنگ می‌شوند. سپس همان سند را با فونت جاسازی‌شده در قالب Word یا PDF ذخیره کن.')}</p>
        </section>
        <footer className="page-footer">
          <span>{t('ساخته‌شده برای نوشتن، به زبان خودت.')}</span>
          <nav className="footer-links" aria-label="GitHub">
            <a href="https://github.com/SoroushJM" dir="ltr">GitHub · SoroushJM</a>
            <a href="https://github.com/SoroushJM/ParsiWord">{t('سورس پروژه')}</a>
          </nav>
          <span>{t('نسخهٔ آزمایشی')} <bdi dir="ltr">{appVersion}</bdi></span>
        </footer>
      </main>

      <input className="sr-only" ref={input} type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" onChange={async e => {
        const file = e.target.files?.[0];
        if (file) {
          if (file.size > 2_000_000) { setNotice({ text: t("حجم فایل برای این نسخه بیش از حد بزرگ است."), error: true }); }
          else { const text = await file.text(); if (text.length <= 500_000) { setPrevious(markdown); setMarkdown(text); update('title', file.name.replace(/\.(md|markdown|txt)$/i, '')); } else setNotice({ text: t("متن باید کمتر از ۵۰۰ هزار نویسه باشد."), error: true }); }
        }
        e.target.value = '';
      }} />

      <Toaster dir={dir} position="bottom-center" theme="light" closeButton
        offset={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0rem))', left: '1.5rem', right: '1.5rem' }}
        mobileOffset={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0rem))', left: '1rem', right: '1rem' }} />
      <ExportSettingsDialog settings={settings} sheet={sheet} onSheetChange={setSheet} onUpdate={update} />
    </div>
  );
}

export default App;
