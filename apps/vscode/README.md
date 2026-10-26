# ParsiWord — RTL Markdown for VS Code

View and edit Persian, Arabic and mixed RTL/LTR Markdown with the same editable preview as [ParsiWord](https://soroushjm.github.io/ParsiWord/). Includes LaTeX, Mermaid, tables, highlighted source/code, Google Fonts with local caching, embedded-font Word/PDF export and exact UTF-8 Markdown export.

Use **Reopen Editor With…** to choose one of three views of the same Markdown document:

- **ParsiWord Source + Result** — source and editable rendered result.
- **ParsiWord Markdown Source** — ParsiWord's RTL-friendly source editor.
- **ParsiWord Rendered Result** — the rendered document with direct rich-text editing.

The combined view is the default for Markdown files. **VS Code source** opens the same document in the native editor alongside it. Native Markdown completion, Outline, folding, snippets, link navigation/validation/rename, workspace search, drag/drop/paste and installed Markdown extensions remain available there. **VS Code preview** opens the native preview for its full HTML/image/plugin support.

All views share one TextDocument, native saving/backups and Undo/Redo. Ctrl+S, Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y in ParsiWord are routed to that document. A retained editor keeps its selection and scroll; reopening as a different editor type starts a new view position.

Common keyboard shortcuts work inside ParsiWord's source and rendered editors (default Windows/Linux bindings):

| Shortcut | Action |
| --- | --- |
| Ctrl+A/C/X/V | Select all, copy, cut and paste using the native clipboard |
| Ctrl+S; Ctrl+Z; Ctrl+Shift+Z or Ctrl+Y | Save, Undo and Redo through the shared VS Code document |
| Ctrl+F | Find literal text in the active source or rendered view; highlight matches and optionally match case |
| F3 / Shift+F3; Enter / Shift+Enter in Find | Next / previous match |
| Ctrl+H | Replace one match or all matches in one document history step |
| Ctrl+G | Go to a Markdown line, optionally `line:column`; source uses the exact position, rendered view reveals the mapped source block |
| Ctrl+Home/End; Shift with navigation keys | Native caret movement and text selection |
| Ctrl+P; Ctrl+Shift+P; Ctrl+Tab / Ctrl+Shift+Tab | VS Code Quick Open, Command Palette and editor tab switching |
| Escape in Find/Replace | Close the search bar and return focus to the selected document match |

Find, Replace and Go to Line are ParsiWord commands whose keybindings can be customized in VS Code. Search and navigation also work on read-only Git revisions; replacement and document edits are disabled there. Undo in an ordinary form field belongs to that field. Multi-cursor editing and selecting multiple occurrences are outside this release's scope. [Validation and scope](../../docs/validation/parsiword-git-comparison.md).

**Git diff** and Markdown changes opened from Source Control compare the index with the working tree inside two ParsiWord editors in adjacent VS Code groups. **Staged diff** compares HEAD with the index. Source shows red/green changed lines and stronger changed-word backgrounds; rendered previews highlight changed blocks. Previous/next controls navigate both sides. Git revisions are read-only; the working file remains editable with native Undo/Redo and saving. Decorations never enter the Markdown or exports. This uses ordinary custom text editors so host history targets the requesting editor reliably. Select the native text diff for Git hunk staging or inline layout. After reloading VS Code, reopen the comparison from Source Control or **Git diff** to restore its pairing.

Use **Reopen Editor With… → Text Editor** to return to the native source or configure a personal editor association. The built-in Markdown and Git extensions stay enabled. Files over the 500,000-character editing limit remain complete in source recovery mode; reduce them below the limit to resume rich editing or use the native editor. Conflicting pending edits are preserved in an unsaved recovery document.

The compact extension interface follows VS Code's UI font, colors and Light, Dark or High Contrast theme. Document typography stays independently configurable. Word/PDF exports retain their print colors. Small rich edits preserve unrelated Markdown spelling, spacing and line endings; ordinary source newlines flow within a paragraph, while explicit hard breaks remain visible.

Choose Persian/English in the header. Export settings control RTL/LTR/automatic direction, font and size. Google Fonts requests contain font names only. Document text is processed locally. Existing ParsiWord export limitations also apply: Markdown images are not yet exported; Mermaid is an image in Word/PDF and LaTeX is editable in Word.

Build from the repository root with `pnpm install --frozen-lockfile`, `pnpm run package:vscode`; install the generated VSIX using **Extensions → Install from VSIX…**. `pnpm run test:vscode` runs integration tests in an isolated VS Code profile.

[Source and issues](https://github.com/SoroushJM/ParsiWord) · [SoroushJM](https://github.com/SoroushJM)
