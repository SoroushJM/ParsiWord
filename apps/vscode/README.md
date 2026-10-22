# ParsiWord — RTL Markdown for VS Code

View and edit Persian, Arabic and mixed RTL/LTR Markdown with the same editable preview as [ParsiWord](https://soroushjm.github.io/ParsiWord/). Includes LaTeX, Mermaid, tables, highlighted source/code, Google Fonts with local caching, embedded-font Word/PDF export and exact UTF-8 Markdown export.

ParsiWord becomes the default editor for Markdown files. **VS Code source** opens the same document in the native editor alongside it. Native Markdown completion, Outline, folding, snippets, link navigation/validation/rename, workspace search, drag/drop/paste and installed Markdown extensions remain available there. **VS Code preview** opens the native preview for its full HTML/image/plugin support.

Both views share one TextDocument, native saving/backups and Undo/Redo. Ctrl+S, Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y in ParsiWord are routed to that document. **Git diff** compares the index with the working tree; **Staged diff** compares HEAD with the index in the native diff editor, retaining its inline/side-by-side views and Git hunk controls.

Use **Reopen Editor With… → Text Editor** to return to the native source or configure a personal editor association. The built-in Markdown and Git extensions stay enabled. Files over the site's 500,000-character editing limit should use the native source.

Choose Persian/English in the header. Export settings control RTL/LTR/automatic direction, font and size. Google Fonts requests contain font names only. Document text is processed locally. Existing ParsiWord export limitations also apply: Markdown images are not yet exported; Mermaid is an image in Word/PDF and LaTeX is editable in Word.

Build from the repository root with `npm ci`, `npm run package:vscode`; install the generated VSIX using **Extensions → Install from VSIX…**. `npm run test:vscode` runs integration tests in an isolated VS Code profile.

[Source and issues](https://github.com/SoroushJM/ParsiWord) · [SoroushJM](https://github.com/SoroushJM)
