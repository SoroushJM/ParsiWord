import { useEffect, useMemo, useState } from 'react';
import { renderMath } from './math';
import { renderMermaid } from './diagrams';
import 'katex/dist/katex.min.css';

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
  const [state, setState] = useState<{ source: string; svg?: string; error?: string }>({ source });
  useEffect(() => {
    let active = true;
    renderMermaid(source).then(diagram => { if (active) setState({ source, svg: diagram.svg }); })
      .catch(error => { if (active) setState({ source, error: (error as Error).message }); });
    return () => { active = false; };
  }, [source]);
  if (state.source !== source || !state.svg && !state.error) return <div role="status">در حال رسم نمودار…</div>;
  if (state.error) return <div className="rich-error" role="alert">{state.error}<pre dir="ltr">{source}</pre></div>;
  return <div dir="ltr" className="mermaid-diagram" role="img" aria-label="نمودار Mermaid" dangerouslySetInnerHTML={{ __html: state.svg! }} />;
}
