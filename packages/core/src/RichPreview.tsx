import { useLocale } from './locale';
import { useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PreviewBounds } from './preview-bounds';
import { renderMath } from './math';
import { diagramFontSize, renderMermaid } from './diagrams';
import 'katex/dist/katex.min.css';
import './diagram-preview.css';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

export function MathView({ source, display = false }: { source: string; display?: boolean }) {
  const { t } = useLocale();
  const paneWidth = useContext(PreviewBounds);
  const natural = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const result = useMemo(() => {
    try { return { html: renderMath(source, display) }; }
    catch (error) { return { error: (error as Error).message }; }
  }, [source, display]);
  useLayoutEffect(() => {
    const content = natural.current;
    if (!content) return;
    const frame = content.closest<HTMLElement>('.math-scroll')!;
    const measure = () => {
      const cell = frame.closest('td, th');
      const style = cell ? getComputedStyle(cell) : null;
      const inset = style ? parseFloat(style.paddingInlineStart) + parseFloat(style.paddingInlineEnd) + parseFloat(style.borderInlineStartWidth) + parseFloat(style.borderInlineEndWidth) : 0;
      const available = paneWidth - inset;
      if (available <= 0) return;
      const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
      frame.style.setProperty('--math-cap', `${available / rootSize}rem`);
      setOverflow(content.getBoundingClientRect().width > available + .5);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [paneWidth, result.html]);
  if (result.html) return <ScrollArea dir="ltr" inline={!display} orientation="horizontal" type={overflow ? 'always' : 'auto'}
    className={cn('math-scroll', display ? 'math-block' : 'math-inline')} data-overflow={overflow}
    viewportProps={{ tabIndex: overflow ? 0 : -1, role: overflow ? 'region' : undefined, 'aria-label': overflow ? t('فرمول ریاضی؛ اسکرول افقی') : undefined }}>
    <span ref={natural} className="math-content" dangerouslySetInnerHTML={{ __html: result.html }} />
  </ScrollArea>;
  if (display) return <Alert variant="destructive"><AlertDescription>{t(result.error || '')} <code dir="ltr">{source}</code></AlertDescription></Alert>;
  // Inline formulas must remain phrasing content inside their paragraph.
  return <span className="rich-error" role="alert">{t(result.error || '')} <code dir="ltr">{source}</code></span>;
}
export function MermaidView({ source }: { source: string }) {
  const [mode, setMode] = useState<'light' | 'dark'>(() => document.documentElement.dataset.displayTheme === 'dark' ? 'dark' : 'light');
  useEffect(() => {
    const update = () => setMode(document.documentElement.dataset.displayTheme === 'dark' ? 'dark' : 'light');
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-display-theme'] });
    update(); return () => observer.disconnect();
  }, []);

  const { t, dir } = useLocale();
  const [state, setState] = useState<{ source: string; svg?: string; width?: number; error?: string }>({ source });
  const [overflowing, setOverflowing] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const hintId = useId();
  useEffect(() => {
    let active = true;
    // Source is directly editable in the rich preview. Coalesce keystrokes
    // before adding expensive SVG/PNG work to the shared render queue.
    const timer = setTimeout(() => {
      renderMermaid(source, mode).then(diagram => { if (active) setState({ source, svg: diagram.svg, width: diagram.width }); })
        .catch(error => { if (active) setState({ source, error: (error as Error).message }); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [source, mode]);
  useEffect(() => {
    const element = frame.current;
    const content = canvas.current;
    if (!element || !content) return;
    const measure = () => setOverflowing(element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(content);
    measure();
    return () => observer.disconnect();
  }, [source, state.svg]);
  // Keep the previous drawing in place while the new source settles, so typing
  // in a diagram does not collapse its height and move the editor viewport.
  if (!state.svg && (state.source !== source || !state.error)) return <div className="flex items-center gap-2"><Spinner aria-label={t("در حال رسم نمودار")} /><span>{t("در حال رسم نمودار…")}</span></div>;
  if (state.error) return <Alert variant="destructive"><AlertDescription>{t(state.error || '')}<pre dir="ltr">{source}</pre></AlertDescription></Alert>;
  const widthInText = state.width! / diagramFontSize;
  return <><div ref={frame} dir="ltr" className="mermaid-diagram" data-diagram-theme={mode} role="img" aria-label={t("نمودار Mermaid")}
    aria-busy={state.source !== source}
    tabIndex={overflowing ? 0 : undefined} aria-describedby={overflowing ? hintId : undefined}>
    <div ref={canvas} className="mermaid-canvas" style={{
      // Fit the panel where possible, without shrinking labels below roughly
      // 0.75rem. Wider diagrams scroll inside their own frame instead of the page.
      width: `clamp(min(${widthInText}em, ${widthInText * .75}rem), 100%, ${widthInText}em)`,
    }} dangerouslySetInnerHTML={{ __html: state.svg! }} />
  </div>{overflowing && <p id={hintId} dir={dir} className="mermaid-scroll-hint">{t("برای دیدن ادامهٔ نمودار، افقی بکش.")}</p>}</>;
}
