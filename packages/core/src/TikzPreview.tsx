import { useEffect, useState } from 'react';
import { useLocale } from './locale';
import { renderTikz } from './tikz';
import { errorMessage } from './errors';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import './tikz-preview.css';

/** A lazy real TeX render; changing source never replaces the editor document. */
export function TikzView({ source }: { source: string }) {
  const { t } = useLocale();
  const [state, setState] = useState<{ source: string; svg?: string; width?: number; error?: string }>({ source });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void renderTikz(source).then(diagram => {
        if (active) setState({ source, svg: diagram.svg, width: diagram.width });
      }).catch(error => {
        if (active) setState({ source, error: errorMessage(error, 'رسم نمودار TikZ انجام نشد.') });
      });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [source]);
  if (state.source === source && state.error) return <Alert variant="destructive"><AlertDescription>
    {t(state.error)}<pre dir="ltr" className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{source}</pre>
  </AlertDescription></Alert>;
  if (!state.svg) return <div className="flex items-center gap-2" role="status"><Spinner aria-hidden="true" /><span>{t('در حال رسم نمودار TikZ…')}</span></div>;
  const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return <div dir="ltr" className="tikz-diagram" role="img" aria-label={t('نمودار TikZ')} aria-busy={state.source !== source}>
    {/* The engine sanitizes the generated SVG before returning its Diagram. */}
    <div className="tikz-canvas" style={{ inlineSize: `${state.width! / rootSize}rem` }} dangerouslySetInnerHTML={{ __html: state.svg }} />
  </div>;
}
