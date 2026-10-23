import { useLocale } from './locale';
import { memo, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownSourceHighlighter, type MarkdownSourceLine } from './markdown-source-highlight';
import { MAX_MARKDOWN_LENGTH } from './document-limits';
import './markdown-source-editor.css';

type Props = {
  editorRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  direction: 'auto' | 'ltr';
  onChange: (value: string) => void;
  onFocus: () => void;
  onCompositionChange?: (composing: boolean) => void;
};

const SourceLine = memo(function SourceLine({ line, index }: { line: MarkdownSourceLine; index: number }) {
  return <span data-source-line={index}>{line.tokens.map((token, index) => token.kind
    ? <span key={index} data-md-token={token.kind}>{token.text}</span>
    : token.text)}{line.newline}</span>;
});

// The native textarea remains the input, selection and sizing surface. Color
// spans are decorative: they never change font metrics or execute source HTML.
export const MarkdownSourceEditor = memo(function MarkdownSourceEditor({ editorRef, value, direction, onChange, onFocus, onCompositionChange }: Props) {
  const { t } = useLocale();
  const paint = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const highlighter = useRef<MarkdownSourceHighlighter | null>(null);
  if (!highlighter.current) highlighter.current = new MarkdownSourceHighlighter();
  const [composing, setComposing] = useState(false);
  const [metricsReady, setMetricsReady] = useState(false);
  // Textarea values use LF line endings. This affects only the decoration;
  // the canonical draft is left untouched until the native input changes it.
  const displayed = value.includes('\r') ? value.replace(/\r\n?/g, '\n') : value;
  const lines = useMemo(() => {
    // Keep pathological newline/token counts from creating a second huge DOM.
    // The native control remains fully editable when decoration is too costly.
    let lineCount = 1;
    for (let at = displayed.indexOf('\n'); at >= 0; at = displayed.indexOf('\n', at + 1)) {
      if (++lineCount > 6_000) return null;
    }
    try {
      const result = highlighter.current!.highlight(displayed);
      let count = 0, colored = false;
      for (const line of result) {
        count += line.tokens.length;
        if (count > 20_000) return null;
        colored ||= line.tokens.some(token => token.kind !== undefined);
      }
      return colored ? result : null;
    }
    catch { return null; }
  }, [displayed]);
  const highlighted = metricsReady && !composing && !!displayed && lines !== null;

  useLayoutEffect(() => {
    const input = editorRef.current, output = paint.current;
    if (!input || !output) return;
    let width = -1;
    const copyMetrics = () => {
      // Read once per width/font/direction change, never for every keystroke.
      const style = getComputedStyle(input);
      for (const property of [
        'box-sizing', 'font-family', 'font-size', 'font-weight', 'font-style',
        'font-stretch', 'font-variant', 'font-feature-settings', 'font-kerning',
        'font-variation-settings', 'font-optical-sizing', 'line-height',
        'letter-spacing', 'word-spacing', 'tab-size', 'padding', 'border-width',
        'white-space', 'overflow-wrap', 'word-break', 'line-break', 'text-indent',
        'text-align', 'text-transform', 'direction', 'unicode-bidi', 'text-rendering',
      ]) output.style.setProperty(property, style.getPropertyValue(property));
      output.style.setProperty('--source-line-height', style.lineHeight);
      setMetricsReady(true);
    };
    copyMetrics();
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width;
      if (next !== undefined && next !== width) { width = next; copyMetrics(); }
    });
    observer.observe(input);
    document.fonts.addEventListener('loadingdone', copyMetrics);
    return () => { observer.disconnect(); document.fonts.removeEventListener('loadingdone', copyMetrics); };
  }, [editorRef, direction]);

  useLayoutEffect(() => {
    // During composition or a controlled external replacement, a stale colored
    // mirror must never cover the characters currently in the native control.
    if (surface.current) surface.current.dataset.highlighted = String(highlighted && editorRef.current?.value === displayed);
  }, [displayed, highlighted, editorRef]);

  return <div ref={surface} className="markdown-source-editor" data-highlighted={highlighted}>
    <div ref={paint} className="markdown-source-highlight" dir={direction} aria-hidden="true">
      {lines?.map((line, index) => <SourceLine key={line.id} line={line} index={index} />)}
    </div>
    <Textarea id="markdown-source" ref={editorRef} className="markdown-editor rounded-none" aria-label={t("متن Markdown")} dir={direction}
      value={value} onFocus={onFocus} onChange={event => onChange(event.target.value)}
      onCompositionStart={() => { if (surface.current) surface.current.dataset.highlighted = 'false'; setComposing(true); onCompositionChange?.(true); }}
      onCompositionEnd={() => { setComposing(false); onCompositionChange?.(false); }} placeholder={t("از اینجا شروع کن…")} spellCheck={false} maxLength={value.length > MAX_MARKDOWN_LENGTH ? undefined : MAX_MARKDOWN_LENGTH} />
  </div>;
});
