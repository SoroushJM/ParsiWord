# Three projects, one Markdown document

## Projects

1. `packages/core` — Markdown parsing, bidi handling, editable React/Tiptap workspace, LaTeX, Mermaid, syntax highlighting, fonts and Word/PDF conversion. No Tauri or VS Code imports. Host services are injected.
2. `apps/parsiword` — the bilingual website and Tauri applications. Owns browser drafts, native dialogs, filesystem and the native Google Fonts transport.
3. `apps/vscode` — the extension host and its webview entry. Reuses the shared workspace, while VS Code's TextDocument owns file contents, persistence, backups and undo history.

Root commands continue to build/test the website. A separate extension command builds and packages its VSIX. The native projects stay together under the application project.

## Implementation and acceptance order

- [x] Move existing code into workspaces and keep the current 902 tests passing.
- [x] Inject file/font/asset/document services and keep web/native behavior intact.
- [x] Register ParsiWord as the default Markdown custom text editor.
- [x] Synchronize minimal edits, native changes, undo/redo, multiple views and unsaved documents without silently overwriting concurrent edits.
- [x] Reuse source/rich editing, RTL/LTR/auto, both languages, math, diagrams, tables, highlighting, fonts and all three exports.
- [x] Integrate native source and native preview commands; retain the built-in Markdown extension and language identifier.
- [x] Open Git working-tree and staged comparisons in VS Code's native diff editor, including repositories in subfolders.
- [x] Test against the installed Windows VS Code with an isolated test workspace/profile; package and install the VSIX for the user.
- [x] Check the web build and representative desktop/mobile UI after the move.

## Capability boundaries

The editable ParsiWord preview and the native source are two views of the same TextDocument. Completion, Outline, folding, rename/references, link validation, workspace search, Markdown extensions, snippets, media paste/drop and source debugging remain provided by the native Markdown editor. The extension includes an explicit native-source action instead of claiming those services run inside a textarea. Native preview is available for VS Code Markdown plugins, HTML and images. The ParsiWord view preserves the existing site's rendering/export capabilities and limitations.

VS Code's native diff remains the authority for Git staging, hunk actions and inline/side-by-side comparisons. No shell parsing of Git output or private editor APIs is required. Stable extension APIs only; the built-in Markdown extension is not disabled.

## Validation evidence

Record commands, versions, results and any remaining limitations in `docs/vscode-validation.md`. A web screenshot alone does not establish extension-host, native Android or desktop application correctness.
