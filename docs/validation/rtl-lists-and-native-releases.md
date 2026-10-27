# RTL lists, optional native comparison and native release publication

Date: 2026-10-27. Extension: **0.1.6**. Local host: Windows, installed
VS Code 1.143.1 and Chrome. All verification was local; no GitHub Actions
build or release publication was started for testing.

## Rendered lists

The exact Persian calendar/folder-selection example reported by the user
is exercised in `apps/vscode/test/rtl-lists.ts`. Previously list items had
their own direction while the containing list inherited its direction.
Logical indentation could therefore reserve room on the opposite side
from the numbered markers. List containers now resolve direction, their
items keep the same marker side, and paragraphs retain independently
resolved Persian/English reading direction. Rich text uses start alignment.
Direction decorations never rewrite canonical Markdown.

The real VS Code test covers both interface languages in ordinary rendered
preview and both narrow side-by-side comparison columns. It asserts all five
items, list/item direction, marker-side room and pane bounds, with unchanged
source. At the tested font size the list reserves 23.8 CSS pixels inside its
right edge. A mixed English/Persian list with nested English/Persian items
checks independent paragraph direction and stable marker placement.

Evidence: `artifacts/rtl-lists-comparison.log`,
`artifacts/vscode-test/rtl-list-metrics.json` and the visually reviewed
`artifacts/vscode-test/rtl-list-comparison.png` capture. A website capture
also checks the same source in a 393×851 mobile preview; it is browser
evidence rather than an Android-device result.

## Optional built-in Git diff

The comparison toolbar offers **VS Code Diff / مقایسه در VS Code**.
It passes the current original/modified URIs to VS Code's built-in text
comparison, including staged comparisons. Command Palette commands expose
Working Tree and Staged native comparisons separately. ParsiWord remains
the default Markdown editor and Source Control comparison.

The actual-host comparison suite checks native `TabInputTextDiff`, index /
working-file and HEAD / index URI pairs, unchanged source and persistence
after automatic comparison refresh. It also retains coverage for the
single-tab ParsiWord comparison, both layouts, source/rendered highlights,
read-only revisions, native Undo/Redo/Save, images and bidirectional scroll
synchronization. All **32 focused checks pass** on the final build.
Evidence: `artifacts/vscode-diff-0.1.6.log`.

## Publication workflow

Android stable-key builds and requested desktop builds publish directly to
a public GitHub prerelease after packaging succeeds. Workflows remain
manual-only. The desktop choice defaults to Windows, with Linux, macOS and
all available explicitly. Android remains ARM64-only; ephemeral-key APKs
remain workflow artifacts.

The publisher groups the exact same source commit under
`native-preview-v<version>-<full commit SHA>`, checks the tag's actual commit,
uploads expected installer types and per-platform build/hash metadata, and
fails on missing files, verification mismatches, permissions or upload
errors. It copies only explicit public asset paths, never signing files.

Ten local publisher tests use real temporary fixture bytes and an isolated
GitHub transport. They cover all desktop formats, shared-release creation
races, existing releases, wrong tags, denied access, failed uploads, missing
Linux formats, Android verification and ephemeral-key refusal. Actionlint
passes both workflows. Local workflow fixtures check every platform matrix
choice and seven Android signing/summary/cleanup cases, including actual
keytool preflight. These checks do not establish a successful hosted native
build, remote asset upload, or installation on a device.

## TikZ diagnosis and other checks

Full `article` / `exam` documents and explicit XeLaTeX/LuaLaTeX dependencies
receive separate Persian/English explanations before a TeX download or
worker allocation. Source stays intact. The bundled e-TeX engine still does
not support XePersian; see [TikZ limits](../tikz.md).

The Chrome cases in `tests/tikz.spec.ts` confirm both-language diagnostics,
no engine requests for incompatible documents, successful correction to a
real drawing, and actual TikZ images/source metadata in Word and PDF.
Three cases pass; log: `artifacts/tikz-diagnostic-browser.log`.

`pnpm test`: **1,240 tests in 40 files passed**. TypeScript/Vite build,
architecture boundaries, starter-document synchronization and whitespace
checks pass. The VSIX is packaged as `artifacts/parsiword-vscode-0.1.6.vsix`
and installed locally; the VS Code CLI reports version 0.1.6. This session
does not claim a fresh full native-host suite, WebKit run, native Android /
Windows Tauri build or device execution.
