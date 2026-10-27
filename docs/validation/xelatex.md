# XeLaTeX/XePersian local validation — 2026-10-27

Pre-publication checks ran on the local Windows computer. No subagents were
used. Publication and CI are now explicitly requested by the user; a push to
main starts the existing workflows without duplicate manual dispatches.

Passed:

- `pnpm test`: 42 files, 1,272 tests, including full-document routing, unchanged
  CRLF source, invalid wrappers, runtime integrity rejection, load/execution
  deadlines, worker disposal and recovery after a font failure.
- `pnpm exec tsc --noEmit`, `pnpm run check:architecture`, `pnpm run build`,
  `pnpm run build:vscode`.
- Two real Chrome tests in `tests/xetex.spec.ts`: a two-page Persian exam with
  numbered questions, math and geometry, using the actual native CSP and with
  external HTTP requests blocked; no SharedArrayBuffer; no horizontal overflow.
  Word contains both PNG pages and the original source metadata. The four-page
  PDF retains Markdown before/after the two TeX pages in the right order, with
  extractable text and zero raster-image paint operations on the vector exam.
  The `/en/` route reports an actual missing font, exposes the TeX log, and
  renders successfully after the source is corrected.
- Three real Chrome TikZ regression cases: e-TeX geometry/libraries/PGFPlots
  under native CSP; real Word/PDF export; invalid-source correction/recovery.
- Actual VS Code 1.143.1 custom-editor integration with
  `PARSIWORD_TEST_FOCUS=xetex node apps/vscode/scripts/test.mjs`: compiles the
  Persian exam within the real webview CSP, saves Word and PDF through native
  dialogs, preserves the source, embeds the Word image/source metadata. The
  saved PDF was parsed outside Electron: extractable Persian text and zero
  raster-image paint operations. Screenshot and exact output paths are in
  `artifacts/vscode-test/results.json` / `xepersian-preview.png`.
- Re-vendoring from pinned cached inputs reproduces 3,422 runnable files,
  78,784,470 unpacked bytes and 32,750,653 runtime download bytes. Original
  package/build archives and license notices are retained.

PDF text assertions apply Unicode NFKC to XeTeX's Arabic presentation forms;
they inspect actual saved text/operators, not only a PDF header or screenshot.
Word assertions inspect actual media and source metadata; they do not establish
editable text inside the page images or a visual Microsoft Word layout review.

The original screenshot is not a machine-readable complete TeX source. The
test uses the analogous full source in `examples/xepersian-exam.md`, including
an explicit bundled font and an RTL Persian TikZ label using `\rl{...}`. It
does not prove the screenshot's exact document compiles unchanged or that its
custom font is present. Actual Android/iOS device execution was not tested;
these platforms share the renderer/assets and still need device verification.

The final local browser suite passed all 87 cases. The full unit suite passed
all 1,272 tests with two workers; an earlier highly concurrent run exceeded
the five-second pagination-test deadline while browser/native suites were also
running. No pagination assertions were removed or relaxed.

The small footer AI-guide button copies static Persian or English authoring
instructions for Markdown, KaTeX, Mermaid, TikZ, complete XePersian documents,
image paths and Word/PDF behavior. Actual Chrome/system-clipboard checks passed
in both locales (normalizing Windows clipboard CRLF), and a denied clipboard
write displayed the error message. The copied text excludes the open document.
The mobile footer screenshot at 393 × 851 had no horizontal overflow. The
VSIX 0.1.9 package was built and inspected for the bundled XeLaTeX files.

Android's previous CI failure occurred after building/signing: its verifier
expected an obsolete `index-*.js` entry instead of the current Vite entry.
Entry discovery now reads all local module scripts from the built HTML and
verifies those names in the native library. Three Python regression cases
passed, including missing/external/escaping entry rejection.

The final full native VS Code run stopped at the unchanged shortcut test's
host-clipboard precondition: `vscode.env.clipboard.writeText` followed by
`readText` returned an empty string, before native Copy was tested. Running
separately from browser tests and bounded retries of that precondition did
not resolve this local host limitation. No shortcut assertion was skipped or
weakened. Focused native XePersian integration passed as recorded above; the
full suite is retained for CI verification on its own Windows runner.

The first publication run passed Pages deployment and all three native package
releases. The editor job passed unit, Chromium and WebKit checks. Its Windows
native job passed shortcuts, linked selections, Git comparisons and image
exports, then exposed a test-fixture CRLF mismatch while locating the TikZ
webview. Native snapshots intentionally normalize text to LF for the textarea;
the original native document remains CRLF. Frame discovery now compares logical
line endings and TikZ-fence matching accepts CRLF. Assertions about unchanged
native source, Undo/Redo and actual exports remain exact.

Explicit CRLF TikZ/XePersian fixtures reproduce that timeout locally before the
fix. Both focused native suites passed after it, including real geometry,
Word/PDF exports, native history and searchable/vector PDF parsing. A manual
`native_only` validation input reruns the complete Windows extension job after
already-passed editor checks, without rebuilding the website or native release
packages. Automatic push validation retains the full editor prerequisite.

The next native run passed TikZ, then exposed XePersian loader integrity failure
on Windows checkout. `core.autocrlf=true checkout-index` reproduced a loader
growth from 298,998 to 307,613 bytes and a SHA256 mismatch. XeTeX assets and source
archives now have the same `-text` preservation used for the older TikZ runtime.
A repeated Windows checkout produces exactly 298,998 bytes and the pinned hash.
The extension build and desktop packaging verify all four real runtime assets
before packaging, so future checkout corruption fails before producing a
broken installer. Native XePersian failures also retain the visible diagnostic
and a screenshot before closing the webview.
