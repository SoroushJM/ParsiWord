import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, BookOpen, Code2, Columns2, Rows3, Pencil, Languages } from 'lucide-react';
import App from './App';
import { EditablePreview } from './EditablePreview';
import { MarkdownSourceHighlighter } from './markdown-source-highlight';
import { parseRichMarkdown } from './rich-editor-markdown';
import { compareMarkdown, type DocumentComparison } from './markdown-diff';
import { inlineParts, sourceUnits } from './comparison-inline';
import { useComparisonScroll } from './use-comparison-scroll';
import type { DocumentSnapshot, EditorHost, EditorAction } from './host';
import type { ExportSettings } from './document-model';
import { useLocale } from './locale';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import './comparison-workspace.css';

type Side = 'original' | 'modified';
type View = 'source' | 'rendered';
type Layout = 'side-by-side' | 'inline';
const ignore = () => {};

function InlineSource({ text, direction }: { text: string; direction: ExportSettings['direction'] }) {
  const lines = useMemo(() => new MarkdownSourceHighlighter().highlight(text), [text]);
  if (lines.length > 6000 || lines.reduce((total, line) => total + line.tokens.length, 0) > 20_000) return <pre className="comparison-source" dir={direction}>{text}</pre>;
  return <pre className="comparison-source" dir={direction}>{lines.map(line => <span key={line.id}>{line.tokens.map((token, index) => <span key={index} data-md-token={token.kind}>{token.text}</span>)}{line.newline}</span>)}</pre>;
}

function reviewModel(before: string, after: string, view: View) {
  const documents = view === 'rendered' ? { original: parseRichMarkdown(before), modified: parseRichMarkdown(after) } : null;
  const parts = (() => {
    const units = (text: string, parsed: ReturnType<typeof parseRichMarkdown>) => parsed.positions.map((position, index) => text.slice(index ? position.start : 0, parsed.positions[index + 1]?.start ?? text.length));
    return documents ? inlineParts(units(before, documents.original), units(after, documents.modified)) : inlineParts(sourceUnits(before), sourceUnits(after));
  })();
  return { documents, parts };
}
function InlineReview({ model: { documents, parts }, view, host, originalImage, originalLink, settings }: { model: ReturnType<typeof reviewModel>; view: View; host: EditorHost; originalImage?: EditorHost['resolveImage']; originalLink?: EditorHost['openLink']; settings: ExportSettings }) {
  const { locale } = useLocale();
  const fa = locale === 'fa';
  const definitionKeys = useMemo(() => documents ? { original: JSON.stringify([...documents.original.definitions]), modified: JSON.stringify([...documents.modified.definitions]) } : null, [documents]);
  return <section className="comparison-inline" aria-label={fa ? 'مرور یکپارچهٔ تغییرات' : 'Unified change review'}>
    {!parts.length && <p>{fa ? 'سند خالی است.' : 'The document is empty.'}</p>}
    {parts.map((part, index) => <section key={`${view}-${index}-${part.text}-${definitionKeys ? definitionKeys[part.kind === 'delete' ? 'original' : 'modified'] : ''}`} className="comparison-part" data-diff={part.kind === 'same' ? undefined : part.kind} data-inline-change={part.change < 0 ? undefined : part.change}
      aria-label={part.kind === 'same' ? undefined : part.kind === 'delete' ? fa ? 'حذف‌شده' : 'Removed' : fa ? 'اضافه‌شده' : 'Added'}>
      {part.kind !== 'same' && <span className="comparison-part-label" aria-hidden="true">{part.kind === 'delete' ? '−' : '+'}</span>}
      {view === 'source' ? <InlineSource text={part.text} direction={settings.direction} /> : <EditablePreview markdown={part.text} direction={settings.direction} fontFamily={settings.fontFamily} fontSize={settings.fontSize}
        inheritedDefinitions={part.kind === 'delete' ? documents!.original.definitions : documents!.modified.definitions}
        resolveImage={part.kind === 'delete' ? originalImage : host.resolveImage} openLink={part.kind === 'delete' ? originalLink ?? host.openLink : host.openLink} readOnly onChange={ignore} onStartWriting={ignore} />}
    </section>)}
  </section>;
}

/** One custom editor tab owns the working document; review panes never own edits. */
export function ComparisonWorkspace({ host, resolveOriginalImage, openOriginalLink, onFocusSide }: { host: EditorHost; resolveOriginalImage?: EditorHost['resolveImage']; openOriginalLink?: EditorHost['openLink']; onFocusSide: (side: Side) => void }) {
  const { locale, number, setLocale, dir } = useLocale();
  const fa = locale === 'fa';
  const [comparison, setComparison] = useState(host.comparison!);
  const [markdown, setMarkdown] = useState(host.initial!.markdown);
  const [displaySettings, setDisplaySettings] = useState(host.initial!.settings);
  const [view, setView] = useState<View>('source');
  const [layout, setLayout] = useState<Layout>('side-by-side');
  const [editing, setEditing] = useState(false);
  const [changeIndex, setChangeIndex] = useState(0);
  const [controlsTarget, setControlsTarget] = useState<HTMLDivElement | null>(null);
  const activeSide = useRef<Side>('modified');
  const actions = useRef({ original: new Set<(action: EditorAction) => void>(), modified: new Set<(action: EditorAction) => void>() });
  const display = useRef({ layout, editing });
  display.current = { layout, editing };
  const container = useRef<HTMLElement>(null);
  const current = useRef({ comparison, markdown });
  current.current = { comparison, markdown };
  const originals = useRef(new Set<(snapshot: DocumentSnapshot) => void>());
  const originalComparisons = useRef(new Set<(comparison: DocumentComparison | undefined) => void>());
  const focus = (side: Side) => { activeSide.current = side; onFocusSide(side); };
  const hosts = useMemo(() => {
    const common = { ...host, subscribeEditorAction: (listener: (action: EditorAction) => void, side: Side) => { actions.current[side].add(listener); return () => { actions.current[side].delete(listener); }; } };
    const modified: EditorHost = { ...host, documentChanged: text => {
      setMarkdown(text);
      for (const listener of originalComparisons.current) listener({ side: 'original', other: text, staged: current.current.comparison.staged });
      host.documentChanged?.(text);
    }, settingsChanged: settings => { setDisplaySettings(settings); host.settingsChanged?.(settings); },
      subscribeEditorAction: listener => common.subscribeEditorAction(listener, 'modified') };
    const original: EditorHost = { ...host, readOnly: true, resolveImage: resolveOriginalImage, openLink: openOriginalLink ?? host.openLink,
      initial: { ...host.initial!, markdown: host.comparison!.other, dirty: false },
      comparison: { side: 'original', other: host.initial!.markdown, staged: host.comparison!.staged },
      documentChanged: undefined, compositionChanged: undefined, settingsChanged: undefined, command: name => { if (!['save', 'undo', 'redo', 'new'].includes(name)) host.command?.(name); },
      subscribeDocument: listener => { originals.current.add(listener); return () => { originals.current.delete(listener); }; },
      subscribeComparison: listener => { originalComparisons.current.add(listener); listener({ side: 'original', other: current.current.markdown, staged: current.current.comparison.staged }); return () => { originalComparisons.current.delete(listener); }; },
      subscribeEditorAction: listener => common.subscribeEditorAction(listener, 'original'),
    };
    return { original, modified };
  }, [host, resolveOriginalImage, openOriginalLink]);
  useEffect(() => host.subscribeEditorAction?.(action => {
    if (display.current.layout === 'inline' && !display.current.editing) {
      activeSide.current = 'modified';
      onFocusSide('modified');
      setEditing(true);
    }
    for (const listener of actions.current[activeSide.current]) listener(action);
  }), [host, onFocusSide]);
  useEffect(() => host.subscribeDocument?.(snapshot => {
    setMarkdown(snapshot.markdown);
    for (const listener of originalComparisons.current) listener({ side: 'original', other: snapshot.markdown, staged: current.current.comparison.staged });
  }), [host]);
  useEffect(() => host.subscribeComparison?.(next => {
    if (!next) return;
    setComparison(next);
    for (const listener of originals.current) listener({ markdown: next.other, dirty: false });
  }), [host]);
  const diff = useMemo(() => compareMarkdown(comparison.other, markdown), [comparison.other, markdown]);
  useComparisonScroll({ containerRef: container, enabled: layout === 'side-by-side', original: comparison.other, modified: markdown, view, revision: JSON.stringify(displaySettings), diff });
  const model = useMemo(() => layout === 'inline' && !editing ? reviewModel(comparison.other, markdown, view) : null, [comparison.other, markdown, view, layout, editing]);
  const count = model ? new Set(model.parts.filter(part => part.change >= 0).map(part => part.change)).size : diff.original.anchors.length;
  const index = Math.min(changeIndex, Math.max(0, count - 1));
  const navigate = (step: number) => {
    if (!count) return;
    const next = (index + step + count) % count;
    setChangeIndex(next);
    if (layout === 'inline' && !editing) {
      const nodes = container.current?.querySelectorAll<HTMLElement>('.comparison-inline [data-inline-change]');
      const groups = [...(nodes ?? [])].filter((node, i, all) => i === 0 || node.dataset.inlineChange !== all[i - 1].dataset.inlineChange);
      groups[Math.min(next, groups.length - 1)]?.scrollIntoView({ block: 'center' });
    } else host.navigateComparison?.(next);
  };
  const switchView = (next: string) => { if (next === 'source' || next === 'rendered') setView(next); };
  const switchLayout = (next: string) => { if (next === 'side-by-side' || next === 'inline') { setLayout(next); setEditing(false); } };
  return <main ref={container} className="comparison-workspace" data-layout={layout} data-view={view} data-editing={editing} dir={dir}>
    <header className="comparison-toolbar flex flex-none flex-wrap items-center gap-x-2 gap-y-1 border-b-[0.0625rem] border-border bg-background px-2 py-1">
      <ToggleGroup type="single" variant="outline" size="sm" value={view} onValueChange={switchView} aria-label={fa ? 'محتوای مقایسه' : 'Comparison content'}>
        <ToggleGroupItem value="source" aria-label="Markdown source"><Code2 data-icon="inline-start" />{fa ? 'سورس Markdown' : 'Markdown source'}</ToggleGroupItem>
        <ToggleGroupItem value="rendered" aria-label="Rendered result"><BookOpen data-icon="inline-start" />{fa ? 'خروجی رندرشده' : 'Rendered result'}</ToggleGroupItem>
      </ToggleGroup>
      <ToggleGroup type="single" variant="outline" size="sm" value={layout} onValueChange={switchLayout} aria-label={fa ? 'چیدمان مقایسه' : 'Comparison layout'}>
        <ToggleGroupItem value="side-by-side" aria-label="Side by side"><Columns2 data-icon="inline-start" />{fa ? 'کنارهم' : 'Side by side'}</ToggleGroupItem>
        <ToggleGroupItem value="inline" aria-label="Inline"><Rows3 data-icon="inline-start" />{fa ? 'یکپارچه' : 'Inline'}</ToggleGroupItem>
      </ToggleGroup>
      <nav className="flex items-center gap-1" aria-label={fa ? 'حرکت بین تغییرات' : 'Navigate changes'}>
        <Button variant="ghost" size="icon-sm" aria-label="Previous change" disabled={!count} onClick={() => navigate(-1)}><ArrowUp /></Button>
        <span className="min-w-12 text-center" data-comparison-position="" aria-live="polite">{count ? `${number(index + 1)} / ${number(count)}` : number(0)}</span>
        <Button variant="ghost" size="icon-sm" aria-label="Next change" disabled={!count} onClick={() => navigate(1)}><ArrowDown /></Button>
      </nav>
      <span className="comparison-counts flex items-center gap-1"><span className="px-1 py-0.5" data-diff="delete">−{number(diff.original.count)}</span><span className="px-1 py-0.5" data-diff="insert">+{number(diff.modified.count)}</span></span>
      <Button variant="outline" disabled={host.readOnly} onClick={() => { focus('modified'); host.command?.('save'); }}>{fa ? 'ذخیره' : 'Save'}</Button>
      <Button variant="ghost" disabled={host.readOnly} onClick={() => { focus('modified'); host.command?.('undo'); }}>Undo</Button>
      <Button variant="ghost" disabled={host.readOnly} onClick={() => { focus('modified'); host.command?.('redo'); }}>Redo</Button>
      {host.kind === 'vscode' && <Button variant="outline" aria-label={fa ? 'باز کردن مقایسه در VS Code' : 'Open comparison in VS Code'} onClick={() => host.command?.('nativeDiff')}>{fa ? 'مقایسه در VS Code' : 'VS Code Diff'}</Button>}
      {layout === 'inline' && <Button variant="outline" disabled={!editing && host.readOnly} aria-label={editing ? 'Review changes' : 'Edit current version'} onClick={() => { setEditing(value => !value); focus('modified'); }}><Pencil data-icon="inline-start" />{editing ? fa ? 'مرور تغییرات' : 'Review changes' : fa ? 'ویرایش نسخهٔ فعلی' : 'Edit current version'}</Button>}
      <Button variant="ghost" aria-label={fa ? 'English' : 'فارسی'} onClick={() => setLocale(fa ? 'en' : 'fa')}><Languages data-icon="inline-start" />{fa ? 'English' : 'فارسی'}</Button>
      <div ref={setControlsTarget} className="comparison-document-controls flex min-w-0 max-w-full flex-none items-center" />
    </header>
    <ResizablePanelGroup className="comparison-editors" orientation="horizontal" dir="ltr" disabled={layout !== 'side-by-side'}>
      {(['original', 'modified'] as const).map(side => <Fragment key={side}><ResizablePanel id={`comparison-${side}`} data-comparison-panel={side} defaultSize="50%" minSize="12rem">
        <section className="comparison-side" dir={dir} data-comparison-side={side} hidden={layout === 'inline' && (!editing || side === 'original')}
        onFocusCapture={() => focus(side)} onPointerDownCapture={() => focus(side)}>
        <div className="comparison-revision">{side === 'original' ? comparison.staged ? 'HEAD' : fa ? 'نسخهٔ staged · فقط خواندنی' : 'Index · Read only' : comparison.staged ? fa ? 'نسخهٔ staged · فقط خواندنی' : 'Index · Read only' : fa ? 'فایل فعلی' : 'Working tree'}</div>
        <App host={hosts[side]} mode={view} embedded instanceId={side} controlsTarget={side === 'modified' ? controlsTarget : undefined} displaySettings={side === 'original' ? displaySettings : undefined} />
      </section>
      </ResizablePanel>
      {side === 'original' && <ResizableHandle withHandle className="comparison-resize-handle" aria-label={fa ? 'تغییر عرض دو سمت مقایسه' : 'Resize comparison panes'} />}
      </Fragment>)}
    </ResizablePanelGroup>
    {model && <InlineReview model={model} view={view} host={host} originalImage={resolveOriginalImage} originalLink={openOriginalLink} settings={displaySettings} />}
  </main>;
}
