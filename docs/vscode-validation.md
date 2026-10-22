# VS Code extension validation

Date: 2026-10-22. Local Windows computer, installed VS Code **1.142.0**, Node **24.13.0**. Extension **SoroushJM.parsiword-vscode 0.1.0**. Three npm workspaces share one implementation of the editor and converters.

The final VSIX was packaged at `artifacts/parsiword-vscode-0.1.0.vsix` (227 files, approximately 5.12 MB) and installed with the local VS Code CLI. `code --list-extensions --show-versions` confirms `soroushjm.parsiword-vscode@0.1.0` in the user's normal installation. The integration report records 19 passing checks.

## Actual extension host and webview

`npm run test:vscode` builds the extension, launches the installed Code.exe through `@vscode/test-electron`, and drives its real Chromium webview through a local DevTools connection. Each run uses a separate test profile, extensions directory and Git repository under ignored `artifacts/vscode-test/`; it does not use the user's documents or personal VS Code settings. Output is in `artifacts/vscode-test/results.json` and `extension-workspace.png`.

Verified in that host:

- Markdown opens in the default ParsiWord custom text editor; the built-in Markdown extension remains enabled and the document language stays Markdown.
- Persian/mixed text, KaTeX, Mermaid, tables and the shared source/rich toolbars render under the packaged webview CSP.
- Source typing, rich typing, native WorkspaceEdit, native undo/redo and saving share the same TextDocument.
- Switching English/Persian preserves the document. Export settings and the offline font picker operate inside the webview.
- Actual Word export contains editable text and OMML equations, font parts and diagram media; actual PDF export is parsed outside Electron and contains searchable text; Markdown bytes match the current source.
- Native source opens alongside ParsiWord. The built-in Markdown Outline and document-link provider operate on the edited file. The native preview command remains usable.
- Working-tree (index ↔ file) and staged (HEAD ↔ index) Git comparisons open `TabInputTextDiff` editors. The fixture includes a subfolder with a space in its name.
- Two custom views synchronize with each other and external disk changes. Unsaved Markdown documents work independently of website drafts.
- Windows CRLF survives browser editing; the native content change covers the small edited range, rather than replacing the whole document.

The pure bridge tests also cover coalesced rapid input, disjoint concurrent edits, overlap recovery, source escapes, emoji boundaries, undo/redo notifications and save notifications. Conflicting local text is retained in a recovery document.

## Shared features and native features

| Capability | Surface and verification |
| --- | --- |
| RTL/LTR/automatic direction, bilingual UI, source/rich editing, tables/lists/links, math/diagrams/code, fonts, Word/PDF/MD exports | One shared implementation in `packages/core`; converter unit tests, existing browser tests and actual extension checks above |
| Completion, folding, Outline, snippets, references/rename, link validation, media paste/drop, workspace search and installed Markdown plugins | Native source of the same TextDocument, opened by **VS Code source**; the built-in extension and language ID are preserved. Outline and links were explicitly exercised; other built-in features were retained through this integration, not reimplemented in the textarea. |
| Native HTML/image/plugin preview and the built-in Markdown editor choices | **VS Code preview** and **Reopen Editor With…** remain available |
| Git staging/hunks, inline/side-by-side comparisons | Native diff editor; working-tree and staged URI pairs explicitly exercised |

## Web and native application preservation

The 902 existing unit tests still pass, with 9 additional bridge tests: **911 tests in 15 files**. All **42 existing browser tests pass** using the installed Chrome. They cover exports, source highlighting/composition, editable rich content, locale switching, font portability, responsive layout and scroll restoration. A fractional scroll-rounding problem found at width 320 was fixed; all four scroll-reflow checks pass. The final website build also succeeds with `VITE_BASE_PATH=/ParsiWord/`. The 393×851 English preview screenshot has no horizontal overflow and shows only the active pane.

`npm run build` checks TypeScript and produces the FA/EN website in root `dist/`. `npm run samples:check` verifies the unchanged starter document: 28,103 characters and 36 code languages. Desktop screenshot at 1280×900 shows both editable panes with no horizontal overflow. Native file-adapter tests remain in the app project. Tauri and CI paths now point to `apps/parsiword/src-tauri`; Android remains ARM64 and its native inset code is unchanged.

No new native Android/iOS/Windows application binary was built during this refactor: Rust/Cargo is not installed on this computer. Web/browser checks do not establish native system-inset or device behavior. The extension was tested in the installed Windows VS Code; other VS Code versions and operating systems have not been manually verified locally. The workflow `.github/workflows/vscode.yml` builds/tests/packages on Windows.

## Existing product limits

The shared editor retains its 500,000-character limit; larger files open in the native source. Markdown images remain outside ParsiWord's export support; native preview provides VS Code's image/HTML/plugin support. Mermaid exports as an image and Word equations remain editable. The VSIX is a local installation package; Marketplace publication requires a separate publisher release.
