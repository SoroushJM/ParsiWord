Help me create a document that I can paste into ParsiWord and export to Word or PDF.
Follow the capabilities and formatting rules below. My request is at the end.

Target: ParsiWord, an RTL Markdown editor with source and editable live preview, Persian/English UI, and .docx, PDF and .md export.
Website: https://soroushjm.github.io/ParsiWord/
Source and documentation: https://github.com/SoroushJM/ParsiWord

Main document format
- Use standard Markdown and GFM tables for ordinary prose, reports, articles, lessons and worksheets. Persian, Arabic, English and mixed RTL/LTR text work. Keep logical character order; never reverse Persian text manually.
- Use # through ###### for headings, blank lines between paragraphs, **bold**, *italic*, ~~strikethrough~~, > for quotes, - or 1. for lists, and - [ ] / - [x] for checklists. Indent nested lists correctly.
- Write tables with a header, a | --- | separator and data rows. Split very wide tables. Do not assume merged cells or HTML page layout.
- Use [label](https://example.com) for links and ![description](./images/figure.png) for images. Markdown reference links/images are also supported.
- Put source code in triple-backtick fences with a language such as python or typescript. Common programming languages have syntax highlighting.
- Return raw Markdown ready to paste. Do not wrap the whole document in an extra Markdown fence; fence only code and diagrams. Do not return an HTML page, CSS, executable JavaScript or a binary file.

Mathematics
- Inline formula: $x^2+y^2=r^2$.
- Put display math between $$ on separate lines, for example:
$$
\int_0^\infty \frac{x^{a-1}}{1+x}\,dx=\frac{\pi}{\sin(\pi a)},\qquad 0<a<1
$$
- Use KaTeX-compatible commands such as \frac, \sqrt, \sum, \int and aligned, matrix or pmatrix environments. Avoid spaces immediately inside inline $ delimiters. Arbitrary LaTeX packages/macros are not available on this math path.
- Normal prose/tables remain editable in Word; supported formulas become Word equations. Formulas/diagrams may be images in PDF; ordinary PDF text remains vector and searchable.

Diagrams and geometry
- For flowcharts and sequence diagrams, use a mermaid fence. For precise geometry and math-question figures, use a tikz fence, for example:
```tikz
\begin{tikzpicture}
\coordinate (O) at (0,0);
\coordinate (A) at (2,0);
\coordinate (B) at (60:2);
\draw (O) circle (2);
\draw (A)--(O)--(B);
\draw[dashed] (A)--(B) node[midway,right] {$x$};
\node[below left] at (O) {$O$};
\end{tikzpicture}
```
- TikZ and PGFPlots are actually compiled. Use mathematical/Latin point labels for simple drawings. For Persian node labels or a complete Persian document, use the XeLaTeX/XePersian path below.
- Mermaid and simple TikZ drawings export as images in Word/PDF, not editable native Word shapes.

Complete Persian documents with XeLaTeX/XePersian
- If I need exact LaTeX page layout, a complete Persian exam or Persian labels inside TikZ, put a complete document in a xelatex fence. latex-document also works, as do latex/tex fences containing \documentclass. Prefer normal Markdown when editable Word prose is the priority.
- Working structure with the bundled Persian font:
```xelatex
\documentclass[12pt,a4paper]{article}
\usepackage{amsmath,amssymb,tikz,geometry,enumitem}
\geometry{margin=2cm}
\usepackage{xepersian}
\settextfont[BoldFont=Vazirmatn-Bold.ttf]{Vazirmatn-Regular.ttf}
\begin{document}
\section*{آزمون ریاضی}
\begin{enumerate}
\item حاصل $\int_0^1 x^2\,dx$ را بیابید.
\item شعاع دایرهٔ زیر ۲ است. محیط آن را حساب کنید.
\begin{center}
\begin{tikzpicture}
\draw (0,0) circle (2);
\node at (0,-2.5) {\rl{دایره با شعاع دو}};
\end{tikzpicture}
\end{center}
\end{enumerate}
\end{document}
```
- Load XePersian after the packages it needs to patch. Wrap Persian TikZ node text in \rl{...}. Use the exact font filenames above. Fonts installed on the computer, including XB Niloofar, are not automatically available inside this engine.
- This is a local, curated runtime with LaTeX, XePersian, bidi, fontspec, amsmath/amssymb, TikZ/PGF, PGFPlots, geometry, enumitem and bundled dependencies. Do not assume all CTAN packages, shell escape, external files or bibliography toolchains are available.
- Each block is limited to 50,000 source characters. Keep documents modest: preview supports up to 12 pages, subject to memory/size limits. Split larger work into independent documents.
- PDF export retains the original XeLaTeX vector pages and text. Word embeds each XeLaTeX page as an image with source in its alternative-text metadata; text inside these page images is not editable. Choose Markdown or XeLaTeX with this distinction in mind.

Images and delivery
- Reference only actual image paths supplied by me. On the website I must choose the Local image base folder and, if needed, the document subfolder. Merely typing C:\... does not grant browser filesystem access. In VS Code, relative images resolve against the Markdown document.
- Online images must be reachable and permit downloading for export. Do not claim invented image paths or placeholders are existing files. A Markdown image is different from loading an external image inside the XeLaTeX engine.
- ParsiWord processes content locally. Its AI-guide button copies this general prompt; it does not send content to an AI service. I will paste your response into ParsiWord and use its Word/PDF export buttons.
- Make the document self-contained where possible. If my request is unclear, ask only for essential subject, audience, language or question-count details. Otherwise produce the final document directly.

My request:
[I will enter the topic, source text, number of questions and required figures here.]
