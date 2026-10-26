# TikZ validation — 2026-10-26

This record covers the local TikZ implementation added after `2fe7682`, and
extension version 0.1.5. [Usage and engine limits](../tikz.md) and
[ADR 0009](../adr/0009-local-tikz-runtime.md) describe its contract.

## Executed locally

The first-launch document now starts with a TikZ circle, two radii, a shaded
sector and a chord question, followed by its solution, a Gaussian integral,
a rotation matrix, gamma/beta identities and the Basel series. The original
RTL corpus and 36 code examples remain below it. On 2026-10-26 the regenerated
document passed `samples:check`, TypeScript and the production build. Fresh
local Chrome profiles on both `/ParsiWord/` and `/ParsiWord/en/` loaded the exact
default source, 18 TikZ SVG paths and six display equations with remote HTTP
requests blocked, no formula errors and no page overflow. An existing saved
draft was preserved. The four new display equations and drawing also passed
local Word/PDF export checks: seven native Word equations including inline
math, one embedded TikZ PNG, and a two-page PDF with eight images, searchable
text and original TikZ alternative text. Desktop/mobile captures and both
rendered PDF pages were visually inspected; the existing rapid-input test
passed against the expanded default document. Evidence is in
`artifacts/starter-showcase-check.json`, `artifacts/starter-rich-input.log`,
`artifacts/starter-showcase.docx`, `artifacts/starter-showcase.pdf` and
`artifacts/starter-*.png`. These new checks ran locally without a test push
or a workflow dispatch, per the user's GitHub Actions usage preference.

Visual PDF review exposed a separate regular-math-font capture defect:
html-to-image 1.11.13's preferred-format filter drops alternating font `src`
declarations because its global regular expression retains `lastIndex`.
Removing the preferred-format option retains all local font sources and avoids
bold substitution and clipped symbols. The new browser regression decodes the
actual PDF equation images and requires nonempty ink with white margins at
both horizontal edges. It failed before the fix and passed afterward. All
three PDF browser cases (including native CSP, offline operation and matching
light/dark exports) plus rapid starter-document input passed locally, four
tests total; see `artifacts/starter-pdf-fonts-before.log` and
`artifacts/starter-pdf-fonts-final.log`. The final production sample PDF was
regenerated and both pages visually inspected after the fix.

| Check | Result | Evidence in the working tree |
| --- | --- | --- |
| Unit suite | 1,216 tests, 39 files passed | `artifacts/tikz-unit-final.log` |
| TypeScript and production build | Passed | `artifacts/tikz-build-final.log` |
| Architecture boundary check | Passed | `pnpm run check:architecture` |
| Complete Chrome UI suite, after the resource relay fix | 72 passed, including all 7 real TikZ cases | `artifacts/tikz-browser-final.log` |
| Production assets under a Pages subfolder | Persian and English routes passed with remote requests blocked; 11 local assets and 17 SVG paths per drawing, no horizontal overflow | `artifacts/tikz-production.json` |
| Actual VS Code 1.143.1 webview | Real TeX/WASM rendering, native document Undo/Redo, Word and PDF exports passed | `artifacts/tikz-vscode-bridge.log`, `artifacts/vscode-test/results.json` |
| Complete focused Git comparison suite after lifecycle fix | All 31 checks passed in actual VS Code, including source/rendered, both layouts, Undo/Redo, synchronized scrolling, reload and images | `artifacts/tikz-diff-lifecycle-final.log` |
| VSIX build and installation | 0.1.5 installed with the VS Code CLI; all 655 packaged files match (ignoring VS Code's added package metadata); all 400 runtime manifest hashes match | `artifacts/tikz-install-verification.json` |
| Visual inspection | Actual VS Code screenshot, mobile browser screenshot, extracted Word drawing and rendered PDF inspected | `artifacts/vscode-test/tikz-preview.png`, `artifacts/tikz-mobile-shape-final.png`, `artifacts/tikz-review/` |

The Chrome cases compile actual circle/radii/chord geometry, an angle with
mathematical labels, TikZ libraries and PGFPlots. They check insertion without
destroying selected prose, draft Cancel/Apply, exact fence and neighboring
Markdown preservation, Undo/Redo, invalid-source recovery, and timeout/restart
after a nonterminating TeX program. The editor remains responsive during that
program. Remote services are blocked in the local-rendering cases.

Export tests open the actual Word ZIP/XML/media and parse PDF image operations,
searchable text and Figure alternative text. Actual VS Code exports contain
one TikZ PNG in Word and five image operations in PDF (one drawing and four
formulas); Word text/native equations remain editable, and PDF text searchable.
Visual inspection confirms the circle, two radii, chord, angle and label outlines
survive PNG embedding. Source metadata preserves the original TikZ.

The isolated VS Code profile loads the extension's production webview under its
real CSP. Its local-resource service worker cannot resolve a blob worker's
owner directly, so only pinned compressed assets are fetched by the owning
window and transferred to the worker. Boundary tests cover exact URL mapping,
byte preservation, transfer lists, disallowed URLs, streaming limits, duplicate
IDs, concurrency limits, cancellation and stale replies. Independent review
found no outstanding runtime/security issue in the relay.

## Full native-suite limitation on this Windows session

The full native suite passed its first 18 checks, then stopped at the clipboard
shortcut check before reaching TikZ. Investigation verified that a known value
written through `vscode.env.clipboard` immediately reads back as empty, before
pressing Copy. Independent PowerShell clipboard writes/reads also fail, and
Win32 `OpenClipboard(NULL)` returns `ERROR_ACCESS_DENIED (5)`. The source editor
is focused with the expected contents and full selection. This establishes a
current OS/session clipboard problem; it does not establish a product shortcut
regression. Clipboard assertions remain strict; no mocks or product workarounds
were added. See `artifacts/shortcuts-clipboard-investigation.log` and
`artifacts/vscode-test/shortcuts-clipboard-stages.json`.

The focused native TikZ suite subsequently passed in that same VS Code build.
Do not describe the full native suite as locally passed. The workflow also runs
the complete native suite on a fresh Windows GitHub runner, after browser checks.

The first [GitHub run](https://github.com/SoroushJM/ParsiWord/actions/runs/40370133888)
passed the complete Chromium suite, all seven WebKit TikZ cases and all native
source/rendered shortcut checks, including real clipboard operations. It then
exposed an automatic Git-comparison promotion race: overlapping refreshes could
close the replacement comparison tab, leaving the workbench empty. Promotion is
now deduplicated by modified URI and column, existing comparison tabs are not
promoted, and the legacy tab's current input is rechecked before closing it.
All 31 focused comparison checks passed locally after this fix. Comparison edit
tests use real one-transaction browser text insertion; the dedicated clipboard
shortcut tests retain their original strict OS assertions. Failure artifacts
now include tab/session diagnostics. These focused checks do not by themselves
establish a full native-suite pass.

## Platform and publication limits

The shared source and assets are included in website, VS Code and Tauri builds.
This session did not build or run a new Android, iOS, Windows Tauri, macOS or
Linux binary. A mobile browser viewport is not an actual native device test.
Previously published native binaries need rebuilding to gain TikZ. No Android
emulator was created or run.

The engine needs roughly 312.5 MiB before app/browser overhead, and the bundled
e-TeX distribution cannot render ordinary Persian/Arabic Unicode in TikZ nodes,
XeLaTeX/LuaLaTeX or arbitrary external packages. Persian question text outside
the figure is supported. Native CSP requires Chromium/WebView 97+; gzip
decompression requires Safari 16.4+ on Apple browsers. These are documented
limits, not claims that every phone or Apple host has been exercised.

Local WebKit installation was unavailable (browser download returned HTTP 403).
The GitHub editor workflow installs WebKit and runs the seven TikZ cases there,
as well as the complete Chromium suite. Local Chrome success alone is not
WebKit evidence. Deployment/CI outcomes should be checked on the feature's
commit; this report records executed local checks rather than predicting CI.
