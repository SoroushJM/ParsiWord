import { describe, expect, it } from 'vitest';
import { prepareTikzSource } from './tikz-source';

describe('TikZ engine source preparation', () => {
  const picture = String.raw`\begin{tikzpicture}[scale=1.2]
\draw (0,0) circle (2);
\end{tikzpicture}`;
  it('passes a full picture body without replacing its content', () => {
    expect(prepareTikzSource(picture)).toEqual({ source: picture, options: {} });
  });
  it('wraps a bare drawing body once', () => {
    const body = String.raw`\draw[red] (0,0)--(2,0);`;
    expect(prepareTikzSource(body)).toEqual({ source: `\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}`, options: {} });
  });
  it('extracts libraries, pgfplots setup and user macros from an explicit picture preamble', () => {
    const preamble = String.raw`\usepackage{pgfplots}
\usetikzlibrary{calc,angles,quotes}
\pgfplotsset{compat=1.18}
\newcommand{\mynode}[1]{\node {#1};}
`;
    expect(prepareTikzSource(preamble + picture)).toEqual({ source: picture, options: { addToPreamble: preamble } });
  });
  it('strips only standalone document wrappers, retaining balanced options and the actual drawing preamble', () => {
    const preamble = String.raw`\documentclass[tikz,border={2pt 3pt},preview=[nested]]{standalone}
\usepackage[unicode,option={value[1]}]{pgfplots}
\usetikzlibrary{angles,quotes,calc}
\newcommand{\labeltext}{A \{literal\} label}
`;
    const source = preamble + '\\begin{document}\n' + picture + '\n\\end{document}\n% trailing comment';
    const result = prepareTikzSource(source);
    expect(result.source).toBe('\n' + picture + '\n');
    expect(result.options.addToPreamble).toBe(preamble.slice(preamble.indexOf('\n')));
    expect(result.options.addToPreamble).toContain('\\usepackage[unicode,option={value[1]}]{pgfplots}');
    expect(source).toContain('\\documentclass');
  });
  it('extracts a leading preamble before a bare drawing', () => {
    const preamble = '\\usetikzlibrary{calc}\n\\tikzset{line/.style={red,thick}}';
    const result = prepareTikzSource(preamble + '\n\\draw[line] (0,0)--(1,0);');
    expect(result.options.addToPreamble).toBe(preamble);
    expect(result.source).toBe('\\begin{tikzpicture}\n\n\\draw[line] (0,0)--(1,0);\n\\end{tikzpicture}');
  });
  it('does not treat comments, escaped backslashes, macro contents or verbatim text as wrappers', () => {
    const preamble = String.raw`% \begin{document} \documentclass{article}
\newcommand{\example}{\begin{document}\end{document}}
`;
    expect(prepareTikzSource(preamble + picture).options.addToPreamble).toBe(preamble);
    const body = String.raw`\node {\verb|\end{document}| and \% literal percent};
% \end{document}
\\begin{document}
\draw (0,0)--(1,0);`;
    expect(prepareTikzSource(body).source).toBe(`\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}`);
    const verbatim = String.raw`\begin{verbatim}
\begin{document}
\documentclass{article}
\end{document}
\end{verbatim}`;
    expect(prepareTikzSource(verbatim).source).toBe(`\\begin{tikzpicture}\n${verbatim}\n\\end{tikzpicture}`);
  });
  it('does not consume a braced body as an extra argument of begin-document', () => {
    const body = '{\\draw (0,0)--(1,0);}';
    expect(prepareTikzSource('\\documentclass{standalone}\\begin{document}' + body + '\\end{document}').source)
      .toBe(`\\begin{tikzpicture}\n${body}\n\\end{tikzpicture}`);
  });
  it.each([
    '\\documentclass{standalone}\\draw (0,0)--(1,0);',
    '\\begin{document}x', '\\end{document}',
    '\\begin{document}x\\end{document}trailing text',
    '\\begin{document}x\\end{document}{}',
    '\\begin{document}\\begin{document}x\\end{document}\\end{document}',
    '\\begin{tikzpicture}x', '\\end{tikzpicture}',
    '\\end{tikzpicture}\\begin{tikzpicture}',
    '\\usetikzlibrary{calc', '\\documentclass[border={2pt]{standalone}',
    '\\verb|unterminated', '\\node {unbalanced;',
    '\\begin{center}\\begin{tikzpicture}x\\end{tikzpicture}\\end{center}',
  ])('rejects unsupported or malformed wrapper rather than altering it silently: %s', source => {
    expect(() => prepareTikzSource(source)).toThrow(expect.objectContaining({ code: 'TIKZ_RENDER_FAILED' }));
  });
  it.each(['article', 'exam', 'report'])('explains unsupported whole-document layout: %s', name => {
    expect(() => prepareTikzSource(`\\documentclass{${name}}\\begin{document}x\\end{document}`))
      .toThrow(expect.objectContaining({ code: 'TIKZ_DOCUMENT_UNSUPPORTED' }));
  });
  it.each([
    String.raw`\documentclass[12pt,a4paper]{article}\usepackage{tikz}\usepackage{xepersian}\settextfont{Vazirmatn}\begin{document}سؤال\end{document}`,
    String.raw`\RequirePackage[no-math]{tikz, fontspec}`,
    String.raw`\usepackage{unicode-math}`,
    String.raw`\usepackage{polyglossia}`,
    String.raw`\setmainfont{Example}`,
    '\\usepackage{tikz,% comment\n xepersian}',
  ])('explains XeLaTeX/LuaLaTeX engine requirements: %s', source => {
    expect(() => prepareTikzSource(source)).toThrow(expect.objectContaining({ code: 'TIKZ_ENGINE_UNSUPPORTED' }));
  });
  it('does not diagnose engine packages written in comments, macros or verbatim examples', () => {
    const source = String.raw`% \usepackage{xepersian}
\newcommand{\example}{\usepackage{fontspec}}
\begin{tikzpicture}
\node {\verb|\settextfont{Example}|};
\end{tikzpicture}`;
    expect(prepareTikzSource(source).source).toContain('\\node');
  });
});
