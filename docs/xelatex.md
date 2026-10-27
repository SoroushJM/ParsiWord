# Full Persian LaTeX documents

ParsiWord runs a local XeLaTeX/XePersian engine for Persian exam sheets and
Unicode TikZ drawings. XeLaTeX is the compiler; XePersian supplies Persian
typesetting and RTL; TikZ draws geometry. The same implementation and bundled
assets serve the website, VS Code and Tauri apps. There is no remote compiler
and the document is not uploaded.

Put a complete document in a `xelatex` or `latex-document` Markdown fence.
`latex`/`tex` fences containing `\documentclass` and existing full-document
`tikz` fences also work. Example:

````markdown
```xelatex
\documentclass{article}
\usepackage{amsmath,amssymb,tikz}
\usepackage[margin=2cm]{geometry}
\usepackage{xepersian}
\settextfont[BoldFont=Vazirmatn-Bold.ttf]{Vazirmatn-Regular.ttf}
\begin{document}
\section*{آزمون ریاضی}
\begin{enumerate}
\item دو شعاع دایره برابر $r=2$ و زاویهٔ بین آن‌ها $60^\circ$ است.
طول وتر را پیدا کنید.
\begin{center}
\begin{tikzpicture}
\coordinate (O) at (0,0);
\coordinate (A) at (2,0);
\coordinate (B) at (60:2);
\draw (O) circle (2);
\draw (A)--(O)--(B);
\draw[dashed] (A)--(B) node[midway,right] {$x$};
\node[below] at (0,-2) {\rl{دایره و دو شعاع}};
\end{tikzpicture}
\end{center}
\item انتگرال $\int_0^1 x^2\,dx$ را محاسبه کنید.
\end{enumerate}
\end{document}
```
````

The [larger tested example](../examples/xepersian-exam.md) includes an improper
integral and a matrix/eigenvalue exercise. Keep XePersian after other packages
which it needs to patch. The bundled Vazirmatn regular/bold fonts are addressed
by **filename**, including `.ttf`, as above. A font installed on the computer
or phone, for example XB Niloofar, is not automatically available to the
isolated TeX filesystem. A missing font produces a translated explanation and
an expandable XeLaTeX log; the source is not silently rewritten. Wrap a
Persian TikZ node label in `\rl{...}` to set its word order explicitly inside
TikZ's LTR drawing context.

The first Unicode document loads about 33 MB of pinned application assets.
Those files ship with native apps and the extension; the website downloads
them from its own deployment and can reuse the browser HTTP cache. This is a
lazy engine load, not a document upload or an automatic CTAN installation.
A website visit still needs the application files; it is not an offline site
installation. `SharedArrayBuffer` and cross-origin isolation are not needed.

Preview displays all compiled PDF pages. Word embeds each page as a separate
PNG with the unchanged source in alternative-text metadata, fitting the Word
page. Text *inside* that page image is not editable Word text. Surrounding
Markdown remains editable Word content. PDF export inserts original TeX PDF
pages between the surrounding Markdown pages: Persian glyphs, equations and
TikZ paths stay vector, with text extraction. Some XeTeX glyph mappings use
Arabic presentation-form characters; semantic text comparisons normalize them
with Unicode NFKC, as PDF search viewers do.

The curated distribution contains LaTeX, XePersian, bidi, fontspec, amsmath,
amssymb, TikZ/PGF, PGFPlots, geometry, enumitem and related dependencies. It is
not a complete TeX Live installation. Unsupported classes/packages, external
images, bibliography toolchains, custom host fonts and shell externalization
can still fail and report the TeX log. Do not assume that every project which
compiles on a desktop TeX distribution will compile here unchanged.

Execution runs in a dedicated worker with an in-memory filesystem, no network
fetch and shell escape disabled. Input is limited to 50,000 characters; engine
loading has a 120-second deadline and execution a separate 45-second deadline.
Cross-references may use two passes, tables of contents up to three. A job is
terminated after success, error or timeout. Preview permits at most 12 pages,
32 million raster pixels in total and a 16 MB PDF. The WASM build can grow its
heap up to 512 MiB in addition to font/package/preview memory. Low-memory
devices may reject large jobs. Android/iOS hardware performance requires
device testing; browser and VS Code tests do not establish it.

Reproduce bundled files with `node scripts/vendor-xetex.mjs` (network required),
or give a directory containing the pinned input files as its argument. Hash
mismatches stop vendoring. Runtime provenance, licenses, source links and local
source archives are in [third-party/xetex](../third-party/xetex/README.md).
