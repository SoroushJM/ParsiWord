# TikZ drawings in ParsiWord

Use a fenced `tikz` block to draw a geometry question inside Markdown.
`tikzpicture` is a case-insensitive alias. The shared editor and renderer serve
the website, VS Code extension, and Tauri desktop/mobile apps.

````markdown
دایره‌ای با شعاع $r=2$ داریم. طول وتر $AB$ را پیدا کنید.

```tikz
\usetikzlibrary{angles,quotes}
\begin{tikzpicture}
\coordinate (O) at (0,0);
\coordinate (A) at (2,0);
\coordinate (B) at (60:2);
\draw[blue,thick] (O) circle (2);
\draw (A) -- (O) -- (B);
\draw[red,dashed] (A) -- (B) node[midway,right] {$x$};
\pic[draw,"$60^\circ$",angle radius=0.7cm] {angle=A--O--B};
\node[below] at (O) {$O$};
\node[right] at (A) {$A$};
\node[above] at (B) {$B$};
\end{tikzpicture}
```
````

The [complete geometry example](../examples/tikz-geometry.md) includes the
question and drawing source. Blocks accept a `tikzpicture` environment, bare
drawing commands, or a common `standalone` document with a preamble and
`document` wrapper. Library/package declarations and user macros compile with
the drawing. For PGFPlots, put `\usepackage{pgfplots}` before the picture,
then use an ordinary `axis` environment inside it.

In editable preview, choose **Edit TikZ drawing** / **ویرایش نمودار TikZ**.
The dialog keeps a draft until **Apply** / **تأیید**. Cancel leaves the
document alone; applying creates one undoable edit. Fence spelling, metadata,
neighboring Markdown and line endings stay intact. Read-only Git revisions
display drawings without editing controls.

Preview uses static SVG with self-contained glyph outlines. Word/PDF embed a
PNG with the original TikZ source in alternative-text metadata, fitting the
available page/list/quote width without stretching. Surrounding Word text and
equations remain editable; surrounding PDF text stays searchable. Export
compiles the current canonical Markdown, including immediate last-minute edits.
An invalid drawing stops export with a translated error instead of omitting it.

The bundled, pinned [TikZJax engine](https://github.com/rod2ik/tikzjax) executes
real e-TeX/PGF in one local worker. Runtime files, PGF/TikZ libraries, PGFPlots
and glyph data ship with every build. The first drawing loads these local
application assets; later drawings reuse the engine. There is no rendering
server, shell execution or automatic CTAN download. A fresh website visit still
requires the site's application files; this feature does not install an offline
copy of the entire website.

Cold downloads have a separate bounded loading budget: up to 60 seconds per
application asset and a 90-second deadline for the entire engine bootstrap.
Once ready, each TeX program still has a 20-second execution limit. A slow
engine download reports a loading/connection timeout rather than asking the
writer to simplify a valid drawing. Loading remains asynchronous, so Markdown
editing stays available while the engine arrives.

This is the bundled e-TeX/TikZ distribution. External files/packages,
XeLaTeX/LuaLaTeX, `fontspec`, `xepersian`, shell escape and externalization are
unavailable. Ordinary Unicode Persian/Arabic text inside TikZ nodes is not
supported by this engine; Persian question text outside the drawing works
normally. Use mathematical/Latin point labels inside the drawing. Unsupported
packages or labels produce a visible error.

TikZ requires WebAssembly, workers and gzip decompression streams; under the
native security policy it requires Chromium/WebView 97+ or Safari 16.4+.
The rest of the app retains its older browser baseline. The engine is lazy,
but its snapshot and job need roughly 312.5 MiB before browser/editor overhead.
Low-memory devices may refuse complex drawings. One worker, idle/failure
termination and source/queue/time/SVG/image budgets bound resource use.
Browser checks do not establish actual Android/iOS native execution.

Reproduce the vendor files using `scripts/vendor-tikz.mjs`. Hashes, provenance,
notices and licenses travel in `packages/core/public/tikz`; corresponding
upstream sources live in `third-party/tikz`. See the
[architecture decision](adr/0009-local-tikz-runtime.md) for the memory and Unicode
trade-offs.
