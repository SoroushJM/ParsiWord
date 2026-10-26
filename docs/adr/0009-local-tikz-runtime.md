# One local TeX worker across ParsiWord hosts

The user wants actual TikZ drawings in Markdown across web, VS Code and
mobile/desktop apps, including both document exports. We use the pinned TikZJax
e-TeX/PGF runtime in one isolated worker with bundled libraries and glyph
outlines. A native LaTeX executable would exclude the browser and require local
installation; a rendering server would receive document source and add a service
dependency. A custom drawing parser would implement a different language subset.

The snapshot and job cost roughly 312.5 MiB, so loading is lazy, jobs are
serialized/bounded and idle or failed workers are terminated. e-TeX cannot
provide XeLaTeX Unicode Persian labels or arbitrary external packages; that
boundary is explicit in the [usage guide](../tikz.md). PGF geometry and PGFPlots
execute in the actual engine. Markdown remains authoritative; confirmed preview
edits enter its existing history and exports compile the same snapshot. Static
SVG is sanitized and glyphs become paths before local PNG encoding, preserving
labels without installed TeX fonts. Component licenses, provenance and upstream
sources accompany distribution. CSP allows WebAssembly compilation without
enabling general JavaScript eval; TikZ therefore requires Chromium/WebView97+
under that policy, while non-TikZ app features retain their older baseline.

The worker requests allowlisted compressed assets through its owning window.
VS Code associates local resource requests with the webview client's identity;
fetching these resources directly from a blob worker stalled the real native
test at engine load. The window performs the exact manifest-mapped fetch and
transfers its compressed bytes to the worker, with at most eight requests,
a four-million-byte limit per asset, and abort on timeout or termination.
TeX execution and decompression remain in the worker. See the
[VS Code worker requirements](https://code.visualstudio.com/api/extension-guides/webview#using-web-workers)
and [local resource service worker](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/webview/browser/pre/service-worker.js).
