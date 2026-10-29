import { useLocale } from './locale';
import { createPortal } from 'react-dom';
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { editorHost, type DocumentComparison, type EditorHost, type DocumentViewMode } from './host';
import type { Editor } from '@tiptap/react';
import { EditorSearch, type SearchRequest } from './EditorSearch';
import { compareMarkdown } from './markdown-diff';
import { DiffToolbar } from './DiffToolbar';
import { useDisplayTheme } from './display-theme';
import { DocumentSession, type MutationOrigin } from './document-session';
import { MAX_MARKDOWN_LENGTH } from './document-limits';
import { Button } from '@/components/ui/button';
import { AiPromptButton } from './AiPromptButton';
import { replaceMarkdown } from './replace-markdown';
import { EditablePreview } from './EditablePreview';
import { LocalImageBaseControl, useLocalImageBase } from './LocalImageBase';
import { MarkdownSourceEditor } from './MarkdownSourceEditor';
import { WorkspacePanels } from './WorkspacePanels';
import { BrandHeader, DocumentHeading, ExportSettingsDialog, IntroControls, MobileViewSwitch, SourceToolbar } from './AppControls';
import { usePreviewScroll } from './use-preview-scroll';
import { useLinkedSelection } from './use-linked-selection';
import type { RichSourceDocument } from './rich-source';
import { errorMessage, errorMessages } from './errors';
import defaultDocument from './default-document.md?raw';

import { BookOpen, CheckCheck, Code2, ShieldCheck } from 'lucide-react';
import { exportPreparedWord, safeFilename } from './adapters/word';
import { markdownContext } from './markdown';
import { defaultSettings, type ExportSettings } from './document-model';
import { openMarkdown, saveDocx, saveMarkdown, savePdf } from './adapters/files';
import { activateFont, documentFonts, fontError } from './adapters/fonts';
import { Badge } from '@/components/ui/badge';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
import '@fontsource-variable/geist';

const SampleLibraryLauncher = import.meta.env.VITE_SAMPLE_LIBRARY === 'false' ? null : lazy(() => import('./sample-library/SampleLibraryLauncher'));

function App({ host, mode, embedded = false, instanceId, controlsTarget, displaySettings }: { host?: EditorHost; mode?: DocumentViewMode; embedded?: boolean; instanceId?: string; controlsTarget?: HTMLElement | null; displaySettings?: ExportSettings } = {}) {
  const { t, dir, number, locale } = useLocale();
  const platform = host ?? editorHost();
  const localImages = useLocalImageBase(platform.kind === 'web');
  const shell = useRef<HTMLDivElement>(null);
  const elementId = (id: string) => instanceId ? `${id}-${instanceId}` : id;
  const displayTheme = useDisplayTheme(platform.kind);
  const [initial] = useState(() => platform.initial ?? { markdown: defaultDocument, settings: { ...defaultSettings, title: locale === 'en' ? 'My note' : defaultSettings.title } });
  const [session] = useState(() => new DocumentSession(initial.markdown, initial.settings));
  const { markdown, settings } = useSyncExternalStore(session.subscribe, session.getSnapshot);
  useLayoutEffect(() => {
    if (!displaySettings) return;
    session.update('title', displaySettings.title);
    session.update('direction', displaySettings.direction);
    session.update('fontFamily', displaySettings.fontFamily);
    session.update('fontSize', displaySettings.fontSize);
    session.update('alignmentOnly', displaySettings.alignmentOnly);
  }, [displaySettings, session]);
  const [comparison, setComparison] = useState<DocumentComparison | undefined>(platform.comparison);
  const [changeIndex, setChangeIndex] = useState(0);
  const [search, setSearch] = useState<SearchRequest | null>(null);
  const [richEditor, setRichEditor] = useState<Editor | null>(null);
  const [retainHistory, setRetainHistory] = useState(false);
  const readOnly = !!platform.readOnly;
  const diff = useMemo(() => comparison ? comparison.side === 'original' ? compareMarkdown(markdown, comparison.other) : compareMarkdown(comparison.other, markdown) : undefined, [markdown, comparison]);
  const diffSide = comparison && diff?.[comparison.side];
  const oversized = markdown.length > MAX_MARKDOWN_LENGTH;
  const viewMode = oversized ? 'source' : mode ?? (platform.kind === 'vscode' ? platform.initial?.viewMode ?? 'combined' : 'combined');
  const setMarkdown = useCallback((next: string | ((previous: string) => string), origin: Exclude<MutationOrigin, 'host'> = 'source') => {
    if (platform.readOnly) return false;
    const previous = session.getSnapshot().markdown;
    const value = typeof next === 'function' ? next(previous) : next;
    if (!session.change(value, origin)) {
      setNotice({ text: locale === 'en' ? 'Markdown exceeds the 500,000-character editing limit. Shorten the text before adding more.' : 'متن Markdown از حد ۵۰۰ هزار نویسه بیشتر می‌شود. پیش از افزودن متن، بخشی از آن را کوتاه کن.', error: true });
      return false;
    }
    if (value !== previous) { setSaved(false); platform.documentChanged?.(value); }
    return true;
  }, [platform, session, locale]);
  const onCompositionChange = useCallback((composing: boolean) => {
    session.composition(composing);
    platform.compositionChanged?.(composing);
  }, [platform, session]);
  const [editingView, setEditingView] = useState<'edit' | 'preview'>(viewMode === 'rendered' ? 'preview' : 'edit');
  const editingViewRef = useRef(editingView);
  const [inactiveSource, setInactiveSource] = useState(initial.markdown);
  const [previewMarkdown, setPreviewMarkdown] = useState(initial.markdown);
  const [sheet, setSheet] = useState<'settings' | 'fonts' | null>(null);
  const [busy, setBusy] = useState(false);
  const exporting = useRef(false);
  const [saved, setSaved] = useState(!platform.initial?.dirty);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const richSource = useRef<RichSourceDocument | null>(null);
  const onRichEditor = useCallback((editor: Editor | null, source?: RichSourceDocument) => {
    richSource.current = editor ? source ?? null : null;
    setRichEditor(editor);
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const { mobileView, selectView, activateView } = usePreviewScroll(editor, preview, markdown, previewMarkdown, viewMode);
  useEffect(() => platform.subscribeComparison?.(value => { setComparison(value); setChangeIndex(0); }), [platform]);
  useEffect(() => platform.subscribeComparisonNavigation?.(index => {
    if (!diffSide?.anchors.length) return;
    const next = Math.max(0, Math.min(index, diffSide.anchors.length - 1));
    setChangeIndex(next);
    const offset = diffSide.anchors[next];
    requestAnimationFrame(() => {
      let target: Element | undefined;
      if (viewMode === 'rendered' || (viewMode === 'combined' && mobileView === 'preview')) {
        const blocks = [...(preview.current?.querySelectorAll('[data-source-start]') ?? [])];
        target = blocks.find(block => Number(block.getAttribute('data-source-end')) > offset) ?? blocks[blocks.length - 1];
      } else {
        const line = markdown.slice(0, offset).split('\n').length - 1;
        target = shell.current?.querySelector(`[data-source-line="${line}"]`) ?? editor.current ?? undefined;
      }
      target?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
  }), [platform, diffSide, mobileView, markdown, viewMode]);
  // Markdown state, export and persistence are current in the input task.
  // Only the secondary textarea's DOM value waits for a short pause. Replacing
  // its entire value on every rich keystroke makes WebView reshape all source.
  const sourceMarkdown = editingView === 'preview' && (mobileView === 'preview' || !matchMedia('(max-width: 56.1875rem)').matches)
    ? inactiveSource : markdown;
  const linkedSelection = useLinkedSelection(editor, richEditor, richSource, markdown, sourceMarkdown, instanceId);
  useEffect(() => {
    if (editingView !== 'preview') return;
    const timer = setTimeout(() => setInactiveSource(markdown), 120);
    return () => clearTimeout(timer);
  }, [markdown, editingView]);
  const activateEditingView = useCallback((view: 'edit' | 'preview') => {
    if (editingViewRef.current !== view) {
      editingViewRef.current = view;
      const current = session.getSnapshot().markdown;
      setInactiveSource(current);
      setPreviewMarkdown(current);
      setEditingView(view);
    }
    activateView(view);
  }, [activateView, session]);
  const selectEditingView = useCallback((view: 'edit' | 'preview') => {
    // Display debounces apply only while an editor remains active. A newly
    // selected pane must receive the authoritative source before its next
    // native input task, including switches that do not focus its editor.
    const current = session.getSnapshot().markdown;
    setInactiveSource(current);
    setPreviewMarkdown(current);
    activateEditingView(view);
    selectView(view);
  }, [activateEditingView, selectView, session]);
  useLayoutEffect(() => {
    if (mode === 'source' || mode === 'rendered') { selectEditingView(mode === 'source' ? 'edit' : 'preview'); setSearch(null); }
  }, [mode, selectEditingView]);
  const onSourceFocus = useCallback(() => activateEditingView('edit'), [activateEditingView]);
  const onPreviewFocus = useCallback(() => activateEditingView('preview'), [activateEditingView]);
  useEffect(() => platform.subscribeEditorAction?.(action => {
    if (session.getSnapshot().composing) return;
    const focused = document.activeElement;
    if (focused?.closest('[role="dialog"]')) return;
    setSearch(previous => ({ action, sequence: (previous?.sequence ?? 0) + 1, rich: previous?.rich ?? editingViewRef.current === 'preview' }));
  }), [platform, session]);
  const updateFromPreview = useCallback((value: string) => {
    activateEditingView('preview');
    if (!setMarkdown(value, 'rich')) return;
    setPreviewMarkdown(value);
  }, [activateEditingView, setMarkdown]);
  const onRichRejected = useCallback((code: 'FILE_TOO_LARGE') => {
    setNotice({ text: t(errorMessages[code]), error: true });
  }, [t]);
  const focusEditor = useCallback(() => {
    if (viewMode === 'rendered') {
      requestAnimationFrame(() => preview.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus());
      return;
    }
    selectEditingView('edit');
    requestAnimationFrame(() => editor.current?.focus());
  }, [selectEditingView, viewMode]);
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
    if (viewMode === 'rendered' || (viewMode === 'combined' && mobileView === 'preview' && matchMedia('(max-width: 56.1875rem)').matches)) return;
    const active = document.activeElement;
    if (active?.matches('input, textarea, [contenteditable="true"]') && !active.matches('.markdown-editor')) {
      const timer = setTimeout(resizeEditor, 160);
      return () => clearTimeout(timer);
    }
    resizeEditor();
  }, [markdown, mobileView, resizeEditor, viewMode]);
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
    if (platform.kind === 'vscode') return;
    setSaved(false);
    const timer = setTimeout(() => {
      try { platform.persistDraft?.({ markdown, settings }); setSaved(true); setStorageError(false); }
      catch { setStorageError(true); }
    }, 500);
    return () => clearTimeout(timer);
  }, [markdown, settings, platform]);
  useEffect(() => { platform.settingsChanged?.(settings); }, [settings, platform]);
  useEffect(() => platform.subscribeDocument?.(snapshot => {
    session.replace(snapshot.markdown);
    setInactiveSource(snapshot.markdown);
    setPreviewMarkdown(snapshot.markdown);
    setSaved(!snapshot.dirty);
  }), [platform, session]);

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
    session.update(key, value);
  }, [session]);

  const wrap = useCallback((before: string, after = '') => {
    const el = editor.current;
    if (!el) return;
    const markdown = session.getSnapshot().markdown;
    const start = el.selectionStart; const end = el.selectionEnd;
    const selected = markdown.slice(start, end);
    if (!setMarkdown(markdown.slice(0, start) + before + selected + after + markdown.slice(end), 'toolbar')) return;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + before.length, end + before.length); });
  }, [session, setMarkdown]);

  const convert = useCallback(async (format: 'docx' | 'pdf' | 'md') => {
    const { markdown, settings } = session.snapshot();
    if ((!markdown.trim() && format !== 'md') || exporting.current) return;
    exporting.current = true;
    setBusy(true);
    try {
      const filename = safeFilename(settings.title).replace(/\.docx$/i, `.${format}`);
      let saved: boolean;
      if (format === 'md') saved = await saveMarkdown(markdown, filename);
      else {
        const context = markdownContext(markdown);
        const fonts = await documentFonts(settings.fontFamily, context.root);
        if (format === 'pdf') {
          const { exportPreparedPdf } = await import('./adapters/pdf');
          saved = await savePdf(await exportPreparedPdf(context, settings, fonts, { resolveImage: platform.resolveImage ?? localImages.resolveImage, readImage: platform.readImage }), filename);
        } else saved = await saveDocx(await exportPreparedWord(context, settings, fonts, undefined, platform.resolveImage ?? localImages.resolveImage, platform.readImage), filename);
      }
      if (saved) {
        const label = format === 'docx' ? 'Word' : format === 'md' ? 'Markdown' : 'PDF';
        setNotice({ text: locale === 'en' ? `${label} file saved.` : `فایل ${label} آماده شد و ذخیره شد.` });
      }
    } catch (error) {
      console.error(`${format.toUpperCase()} export failed`, error);
      setNotice({ text: t(errorMessage(error, "ذخیرهٔ فایل انجام نشد. فضای خالی و محل ذخیره را بررسی کن و دوباره امتحان کن.")), error: true });
    } finally { exporting.current = false; setBusy(false); }
  }, [t, locale, session, platform, localImages.resolveImage]);

  const importFile = useCallback(async () => {
    if (platform.kind === 'web') { input.current?.click(); return; }
    try {
      const file = await openMarkdown();
      if (file) { setPrevious(session.getSnapshot().markdown); if (setMarkdown(file.text, 'import')) update('title', file.name); }
    } catch (error) {
      setNotice({ text: t(errorMessage(error, "باز کردن فایل انجام نشد. یک فایل متنی یا Markdown انتخاب کن.")), error: true });
    }
  }, [update, t, session, setMarkdown]);

  const onDirectionChange = useCallback((direction: ExportSettings['direction']) => update('direction', direction), [update]);
  const onTitleChange = useCallback((title: string) => update('title', title), [update]);
  const onSettings = useCallback(() => setSheet('settings'), []);
  const onNew = useCallback(() => {
    if (platform.kind === 'vscode') { platform.command?.('new'); return; }
    setPrevious(session.getSnapshot().markdown);
    setMarkdown('');
    update('title', t("یادداشت تازه"));
    focusEditor();
  }, [update, focusEditor, t, session, setMarkdown]);
  const onRestore = useCallback(() => {
    if (previous !== null && setMarkdown(previous, 'restore')) setPrevious(null);
  }, [previous, setMarkdown]);
  const onOpen = importFile;
  const onExport = useCallback(() => { void convert('docx'); }, [convert]);
  const onExportPdf = useCallback(() => { void convert('pdf'); }, [convert]);
  const onExportMarkdown = useCallback(() => { void convert('md'); }, [convert]);
  const onWrap = wrap;

  const documentHeading = <DocumentHeading instanceId={instanceId} hostControlled={platform.kind === 'vscode'} compact={embedded} direction={settings.direction} onDirectionChange={onDirectionChange} title={settings.title} busy={busy} canExport={!!markdown.trim()} onTitleChange={onTitleChange} onOpen={onOpen} onNew={onNew} onSettings={onSettings} onExport={onExport} onExportPdf={onExportPdf} onExportMarkdown={onExportMarkdown} />;
  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/u).length : 0;
  const sampleLibrary = SampleLibraryLauncher && <Suspense fallback={null}><SampleLibraryLauncher
    current={() => session.getSnapshot().markdown} readOnly={readOnly}
    load={next => {
      if (!richEditor || !richSource.current || session.getSnapshot().composing) return false;
      if (!replaceMarkdown(richEditor, richSource.current, session.getSnapshot().markdown, next)) return false;
      if (platform.kind !== 'vscode') setRetainHistory(true);
      setInactiveSource(next);
      setPreviewMarkdown(next);
      selectEditingView(viewMode === 'source' ? 'edit' : 'preview');
      requestAnimationFrame(() => {
        if (viewMode === 'source') { editor.current?.focus(); editor.current?.setSelectionRange(0, 0); }
        else richEditor.commands.focus('start');
      });
      return true;
    }} /></Suspense>;

  return (
    <div ref={shell} className="app-shell" data-document-title={settings.title} data-embedded={embedded || undefined} data-host={platform.kind} data-comparison={comparison?.side} onKeyDownCapture={event => {
      if (event.nativeEvent.isComposing || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      const command = key === 's' ? 'save' : key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : null;
      const documentInput = (event.target as HTMLElement).closest('.markdown-editor, .rich-document');
      if (platform.kind !== 'vscode') {
        if (retainHistory && documentInput && !readOnly && (command === 'undo' || command === 'redo') && richEditor && richSource.current) {
          event.preventDefault(); event.stopPropagation();
          const current = session.getSnapshot().markdown;
          replaceMarkdown(richEditor, richSource.current, richSource.current.snapshot(richEditor.state.doc).text, current, true);
          richEditor.commands[command]();
        }
        return;
      }
      if ((command === 'undo' || command === 'redo') && !documentInput && (event.target as HTMLElement).matches('input, textarea, [contenteditable="true"]')) {
        // Let ordinary form controls keep their browser history without the
        // outer VS Code webview forwarding Undo to the Markdown document.
        event.stopPropagation();
        return;
      }
      if (command && (command === 'save' || documentInput)) { event.preventDefault(); event.stopPropagation(); if (!readOnly) platform.command?.(command); }
    }}>
      {!embedded && <BrandHeader theme={displayTheme} />}

      <main>
        {!embedded && platform.kind === 'vscode' && <nav className="host-actions" aria-label="VS Code">
          <Button variant="outline" onClick={() => { selectEditingView('preview'); platform.command?.('source'); }}>{locale === 'fa' ? 'منبع بومی VS Code' : 'VS Code source'}</Button>
          <Button variant="outline" onClick={() => platform.command?.('preview')}>{locale === 'fa' ? 'پیش‌نمایش VS Code' : 'VS Code preview'}</Button>
          <Button variant="outline" onClick={() => platform.command?.('diff')}>Git diff</Button>
          <Button variant="outline" onClick={() => platform.command?.('stagedDiff')}>Staged diff</Button>
          <Button variant="outline" disabled={readOnly} onClick={() => platform.command?.('save')}>{locale === 'fa' ? 'ذخیرهٔ سند' : 'Save document'}</Button>
          <Button variant="ghost" disabled={readOnly} onClick={() => platform.command?.('undo')}>Undo</Button>
          <Button variant="ghost" disabled={readOnly} onClick={() => platform.command?.('redo')}>Redo</Button>
        </nav>}
        {!embedded && comparison && diff && <DiffToolbar comparison={comparison} diff={diff} index={changeIndex} onNavigate={index => platform.navigateComparison?.(index)} />}
        {search && <EditorSearch request={search} markdown={markdown} source={editor} rich={richEditor} readOnly={readOnly} instanceId={instanceId} onChange={setMarkdown} onClose={() => setSearch(null)} />}
        <IntroControls direction={settings.direction} onDirectionChange={onDirectionChange} />

        <div className="workspace">
          <section className="document-panel" aria-label={t("ویرایش سند")}>
            {controlsTarget ? createPortal(documentHeading, controlsTarget) : documentHeading}
            {platform.kind === 'web' && <LocalImageBaseControl model={localImages} />}

            {oversized && <div role="alert" className="p-4 text-sm">{locale === 'en' ? 'The complete recovered document exceeds the editing limit. It is preserved here: save a Markdown copy or delete text to return below 500,000 characters. Rich preview is paused.' : 'متن بازیابی‌شده کامل حفظ شده و از حد ویرایش بیشتر است. یک نسخهٔ Markdown ذخیره کن یا با حذف متن آن را به زیر ۵۰۰ هزار نویسه برسان. پیش‌نمایش موقتاً متوقف است.'}</div>}
            <div className="live-workspace" data-view={mobileView} data-mode={viewMode}>
            <MobileViewSwitch view={mobileView} onSelect={selectEditingView} />
            <WorkspacePanels
              instanceId={instanceId}
              combined={viewMode === 'combined'}
              direction={dir}
              label={locale === 'en' ? 'Resize editor and preview' : 'تغییر عرض ویرایشگر و پیش‌نمایش'}
              source={
                <section id={elementId("edit-panel")} className="editing-pane" aria-labelledby={elementId("edit-heading")} onPointerDownCapture={onSourceFocus}>
                  <div className="pane-heading"><h2 id={elementId("edit-heading")}><Code2 size="1.0625rem" /> {t("ویرایش متن")}</h2><span>Markdown</span></div>
                  <SourceToolbar readOnly={readOnly} canRestore={previous !== null} onWrap={onWrap} onRestore={onRestore} />
                  <FieldGroup className="gap-0"><Field className="gap-0"><FieldLabel htmlFor={elementId("markdown-source")} className="sr-only">{t("متن Markdown")}</FieldLabel><MarkdownSourceEditor id={elementId("markdown-source")} editorRef={editor} value={sourceMarkdown} direction={settings.direction} onFocus={onSourceFocus} onChange={setMarkdown} onCompositionChange={onCompositionChange} diff={diffSide} readOnly={readOnly} searching={!!search} linkedSelection={linkedSelection} /></Field></FieldGroup>
                </section>
              }
              preview={
                <section id={elementId("preview-pane")} className="preview-pane" aria-labelledby={elementId("preview-heading")}>
                  <div className="pane-heading"><h2 id={elementId("preview-heading")}><BookOpen size="1.0625rem" /> {t("پیش‌نمایش")}</h2></div>
                  <div ref={preview} id={elementId("preview-panel")} className="preview-panel" aria-busy={previewMarkdown !== markdown} onFocusCapture={onPreviewFocus} onPointerDownCapture={onPreviewFocus}>
                    {!oversized && <EditablePreview retainExternalHistory={retainHistory} markdown={previewMarkdown} direction={settings.direction} fontFamily={settings.fontFamily} fontSize={settings.fontSize} onChange={updateFromPreview} onStartWriting={focusEditor} onCompositionChange={onCompositionChange} onRejected={onRichRejected} diff={diffSide} readOnly={readOnly} resolveImage={platform.resolveImage ?? localImages.resolveImage} openLink={platform.openLink} showReadOnlyToolbar={embedded} onEditor={onRichEditor} />}
                  </div>
                </section>
              }
            />
            </div>

            <div className="editor-status"><span>{number(wordCount)} {t("واژه")}<span className="separator">·</span> {number(markdown.length)} {t("نویسه")}</span>{platform.kind === 'vscode' && sampleLibrary}<Badge variant={storageError ? 'destructive' : 'secondary'}>{storageError ? t("ذخیرهٔ خودکار در دسترس نیست") : saved ? <><CheckCheck data-icon="inline-start" /> {t("ذخیره شد")}</> : t("در حال ذخیره…")}</Badge></div>
          </section>

        </div>
        <div className="privacy-note workspace-privacy"><ShieldCheck size="1rem" /><span>{t("متن تو روی دستگاه پردازش می‌شود. فونت‌های جدید و تصاویر آنلاین از اینترنت دریافت می‌شوند.")}</span></div>
        <section className="product-explanation" aria-labelledby="why-parsiword">
          <h2 id="why-parsiword">{t('چرا پارسی‌ورد؟')}</h2>
          <p>{t('دیدن و ویرایش Markdown راست‌به‌چپ نباید سخت باشد. پارسی‌ورد منبع Markdown و پیش‌نمایش قابل ویرایش را کنار هم می‌گذارد تا متن فارسی و عربی، واژه‌های انگلیسی، عددها و فرمول‌ها را در جهت مناسب بخوانی و ویرایش کنی.')}</p>
          <p>{t('در منبع Markdown یا مستقیماً در پیش‌نمایش بنویس؛ تغییرات بین هر دو هماهنگ می‌شوند. سپس همان سند را با فونت جاسازی‌شده در قالب Word یا PDF ذخیره کن.')}</p>
        </section>
        <footer className="page-footer">
          <span>{t('ساخته‌شده برای نوشتن، به زبان خودت.')}</span>
          <nav className="footer-links flex flex-wrap items-center gap-x-4 gap-y-2" aria-label="GitHub">
            <a href="https://github.com/SoroushJM" dir="ltr">GitHub · SoroushJM</a>
            <a href="https://github.com/SoroushJM/ParsiWord">{t('سورس پروژه')}</a>
          </nav>
          <div className="flex items-center gap-2"><span>{t('نسخهٔ آزمایشی')} <bdi dir="ltr">{platform.version}</bdi></span><AiPromptButton />{platform.kind !== 'vscode' && sampleLibrary}</div>
        </footer>
      </main>

      <input className="sr-only" ref={input} type="file" accept=".md,.markdown,.txt,text/plain,text/markdown" onChange={async e => {
        const file = e.target.files?.[0];
        if (file) {
          if (file.size > 2_000_000) { setNotice({ text: t("حجم فایل برای این نسخه بیش از حد بزرگ است."), error: true }); }
          else { const text = await file.text(); if (setMarkdown(text, 'import')) { setPrevious(markdown); update('title', file.name.replace(/\.(md|markdown|txt)$/i, '')); } }
        }
        e.target.value = '';
      }} />

      {(!embedded || instanceId === 'modified') && <Toaster dir={dir} position="bottom-center" theme={displayTheme.resolvedTheme} closeButton
        offset={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0rem))', left: '1.5rem', right: '1.5rem' }}
        mobileOffset={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0rem))', left: '1rem', right: '1rem' }} />}
      <ExportSettingsDialog settings={settings} sheet={sheet} onSheetChange={setSheet} onUpdate={update} />
    </div>
  );
}

export default App;
