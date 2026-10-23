import { Fragment, useMemo } from 'react';
import { highlightCode } from './code-highlight';

export function CodeView({ source, language }: { source: string; language?: string }) {
  const code = useMemo(() => highlightCode(source, language), [source, language]);
  return <figure className="code-block" dir="ltr" data-language={code.language || ''}>
    <figcaption>{code.label}</figcaption>
    <pre><code>{code.lines.map((line, i) => <Fragment key={i}>
      {i > 0 && '\n'}{line.map((token, j) => <span key={j} data-scope={token.scope} style={{
        fontWeight: token.bold ? 700 : undefined,
        fontStyle: token.italic ? 'italic' : undefined,
      }}>{token.text}</span>)}
    </Fragment>)}</code></pre>
  </figure>;
}
