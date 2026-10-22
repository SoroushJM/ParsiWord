import { Children, isValidElement, memo, useMemo, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { ArrowLeft, FileText } from 'lucide-react';
import { MathView, MermaidView } from './RichPreview';
import { CodeView } from './CodeView';
import { mathLanguage } from './rich-content';
import { paragraphDirection, type Direction } from './converter';

function renderedText(value: ReactNode): string {
  return Children.toArray(value).map(child => typeof child === 'string' || typeof child === 'number'
    ? String(child)
    : isValidElement<{ children?: ReactNode; className?: string }>(child) ? (/math-(inline|display)/.test(child.props.className || '') ? '\ufffc' : renderedText(child.props.children)) : '').join('');
}

export const DocumentPreview = memo(function DocumentPreview({ markdown, direction, fontFamily, fontSize, onStartWriting }: {
  markdown: string; direction: Direction; fontFamily: string; fontSize: number; onStartWriting: () => void;
}) {
  // Keep renderer identities stable while typing or saving, so formulas and
  // diagrams are not unmounted by unrelated editor/status changes.
  const components = useMemo(() => {
    const previewDir = (children: ReactNode) => paragraphDirection(renderedText(children), direction);
    return {
      pre: ({ children }: ComponentPropsWithoutRef<'pre'>) => {
        const code = Children.toArray(children).find(child => isValidElement<{ className?: string; children?: ReactNode }>(child));
        if (!isValidElement<{ className?: string; children?: ReactNode }>(code)) return <pre>{children}</pre>;
        const language = code.props.className?.match(/language-(\S+)/)?.[1];
        if (language?.toLowerCase() === 'mermaid' || mathLanguage(language)) return <>{children}</>;
        return <CodeView source={String(code.props.children).replace(/\n$/, '')} language={language} />;
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
  }, [direction]);
  return <>
    {markdown.trim() ? <article className="prose" dir={direction === 'auto' ? 'auto' : direction} style={{ fontSize: `${fontSize + 2}px`, fontFamily: `"${fontFamily}", Vazirmatn, "ParsiWord Symbols", sans-serif` }}>
      <Markdown remarkPlugins={[remarkGfm, remarkMath]} components={components}>{markdown}</Markdown>
    </article> : <div className="empty-preview"><FileText size={36} /><p>هنوز چیزی ننوشته‌ای.</p><button onClick={onStartWriting}>شروع نوشتن <ArrowLeft size={16} /></button></div>}
    <p className="preview-disclaimer">پیش‌نمایش متن است؛ صفحه‌بندی و نمایش نهایی را در Word بررسی کن.</p>
  </>;
});
