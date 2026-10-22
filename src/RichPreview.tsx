import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { renderMath } from './math';
import { diagramFontSize, renderMermaid } from './diagrams';
import 'katex/dist/katex.min.css';
import './diagram-preview.css';

export function MathView({ source, display = false }: { source: string; display?: boolean }) {
  const result = useMemo(() => {
    try { return { html: renderMath(source, display) }; }
    catch (error) { return { error: (error as Error).message }; }
  }, [source, display]);
  const Tag = display ? 'div' : 'span';
  return result.html
    ? <Tag dir="ltr" className={display ? 'math-block' : 'math-inline'} dangerouslySetInnerHTML={{ __html: result.html }} />
    : <Tag className="rich-error" role="alert">{result.error} <code dir="ltr">{source}</code></Tag>;
}
export function MermaidView({ source }: { source: string }) {
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
      renderMermaid(source).then(diagram => { if (active) setState({ source, svg: diagram.svg, width: diagram.width }); })
        .catch(error => { if (active) setState({ source, error: (error as Error).message }); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [source]);
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
  if (!state.svg && (state.source !== source || !state.error)) return <div role="status">در حال رسم نمودار…</div>;
  if (state.error) return <div className="rich-error" role="alert">{state.error}<pre dir="ltr">{source}</pre></div>;
  const widthInText = state.width! / diagramFontSize;
  return <><div ref={frame} dir="ltr" className="mermaid-diagram" role="img" aria-label="نمودار Mermaid"
    aria-busy={state.source !== source}
    tabIndex={overflowing ? 0 : undefined} aria-describedby={overflowing ? hintId : undefined}>
    <div ref={canvas} className="mermaid-canvas" style={{
      // Fit the panel where possible, without shrinking labels below roughly
      // 12px. Wider diagrams scroll inside their own frame instead of the page.
      width: `clamp(min(${widthInText}em, ${widthInText * 12}px), 100%, ${widthInText}em)`,
    }} dangerouslySetInnerHTML={{ __html: state.svg! }} />
  </div>{overflowing && <p id={hintId} dir="rtl" className="mermaid-scroll-hint">برای دیدن ادامهٔ نمودار، افقی بکش.</p>}</>;
}
