import { describe, expect, it } from 'vitest';
import { prepareXeLatexSource, requiresXeLatex } from './tikz-source';
import { isTikzLanguage } from './tikz-language';

describe('XeLaTeX source dispatch and preservation', () => {
  it('preserves the complete document, preamble, class options and Persian source byte for byte', () => {
    const source = '\\documentclass[12pt,a4paper]{article}\r\n\\usepackage{xepersian}\r\n\\begin{document}\r\nسؤال و شکل\\end{document}\r\n% end';
    expect(requiresXeLatex(source)).toBe(true); expect(prepareXeLatexSource(source)).toBe(source);
  });
  it('wraps a Unicode drawing with its font setup before begin-document', () => {
    const source = String.raw`\usepackage{xepersian}
\settextfont{Vazirmatn-Regular.ttf}
\begin{tikzpicture}\node {دایره};\end{tikzpicture}`;
    const prepared = prepareXeLatexSource(source);
    expect(requiresXeLatex(source)).toBe(true);
    expect(prepared.indexOf('settextfont')).toBeLessThan(prepared.indexOf('begin{document}'));
    expect(prepared).toContain(source.slice(source.indexOf('\\begin{tikzpicture}')));
  });
  it('ignores Unicode packages and classes in comments, macros and verbatim examples', () => {
    const source = String.raw`% \documentclass{article}
\newcommand{\example}{\usepackage{xepersian}}
\begin{tikzpicture}\node {\verb|\settextfont{Example}|};\end{tikzpicture}`;
    expect(requiresXeLatex(source)).toBe(false);
  });
  it.each(['\\documentclass{article}', '\\begin{document}x', '\\documentclass{article}\\end{document}', '\\documentclass{article}\\begin{document}x\\end{document}TRAILING'])('rejects an incomplete document without discarding source: %s', source => {
    expect(() => prepareXeLatexSource(source)).toThrow(expect.objectContaining({ code: 'XETEX_DOCUMENT_INVALID' }));
  });
  it('recognizes full latex/tex fences while retaining ordinary formula fences', () => {
    for (const lang of ['latex', 'TeX', 'XeLaTeX', 'latex-document']) expect(isTikzLanguage(lang, '\\documentclass{article}')).toBe(true);
    expect(isTikzLanguage('latex', '\\frac{1}{2}')).toBe(false);
    expect(isTikzLanguage('latex', '% \\documentclass{article}\n\\frac{1}{2}')).toBe(false);
  });
});
