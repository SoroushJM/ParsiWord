# ParsiWord — RTL Markdown for VS Code

View and edit Persian, Arabic and mixed RTL/LTR Markdown with the same editable preview as [ParsiWord](https://soroushjm.github.io/ParsiWord/). Includes LaTeX, Mermaid, tables, highlighted source/code, Google Fonts with local caching, embedded-font Word/PDF export and exact UTF-8 Markdown export.

Use **Reopen Editor With…** to choose one of three views of the same Markdown document:

- **ParsiWord Source + Result** — source and editable rendered result.
- **ParsiWord Markdown Source** — ParsiWord's RTL-friendly source editor.
- **ParsiWord Rendered Result** — the rendered document with direct rich-text editing.

The combined view is the default for Markdown files. **VS Code source** opens the same document in the native editor alongside it. Native Markdown completion, Outline, folding, snippets, link navigation/validation/rename, workspace search, drag/drop/paste and installed Markdown extensions remain available there. **VS Code preview** opens the native preview for its full HTML/plugin support.

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

**Git diff** and Markdown changes opened from Source Control compare the index with the working tree in **one ParsiWord comparison tab**. **Staged diff** compares HEAD with the index. Choose **Markdown source** or **Rendered result**, then **Side by side** or **Inline**. Source shows red/green changed lines and stronger changed-word backgrounds; rendered views highlight changed blocks. Previous/next controls navigate changes. Side-by-side columns have aligned headers, synchronized scrolling in both directions and a draggable, keyboard-accessible divider. Document font, size and direction apply to both sides and the inline review.

Git revisions are read-only; the working file remains editable with native Undo/Redo and saving. Side by side supports direct source and rich editing. Inline presents a unified review stream with deletions followed by insertions; **Edit current version** reveals the same working editor in the same tab and **Review changes** returns to the diff. Find/Replace/Go to Line from an inline review also reveal the current-version editor. Decorations never enter Markdown or exports. The comparison uses a stable custom text editor attached to the working TextDocument; it does not need proposed VS Code APIs or a second history store. Native Git hunk staging remains available through the native text diff. [Decision and behavior](../../docs/adr/0008-single-tab-comparison-and-images.md).

Markdown images appear inside ParsiWord's rendered editor and comparison, including reference-style images and relative paths such as `![Diagram](./images/circle.svg)`. Local paths resolve relative to the Markdown file inside its document/project resource roots. HTTPS images are supported too. Image loading preserves the exact Markdown spelling; unavailable preview images keep their alternative text. In a historical revision, the image path uses that revision's document location, but image bytes are read from the current local asset rather than its historical Git blob.

Word and PDF exports embed the actual Markdown images, including relative SVG/PNG files and reference images. The exported document is independent of the original image files. SVG, PNG, JPEG, GIF, WebP, AVIF and BMP are normalized to embedded PNG; animations become a still frame. Images retain their aspect ratio and fit page/list/table bounds. Local and HTTPS image bytes are read through the extension host with resource, timeout and memory limits; no external proxy or webview network-policy relaxation is required. A missing or invalid image stops export with an error instead of silently producing an incomplete file.

Use **Reopen Editor With… → Text Editor** to return to the native source or configure a personal editor association. The built-in Markdown and Git extensions stay enabled. Files over the 500,000-character editing limit remain complete in source recovery mode; reduce them below the limit to resume rich editing or use the native editor. Conflicting pending edits are preserved in an unsaved recovery document.

The compact extension interface follows VS Code's UI font, colors and Light, Dark or High Contrast theme. The filename, personal-draft label and website-only Open/New controls are omitted inside the editor, since VS Code manages files and tabs. Export and document display settings remain available; comparison places them in its shared toolbar. Document typography stays independently configurable. Word/PDF exports retain their print colors. Small rich edits preserve unrelated Markdown spelling, spacing and line endings; ordinary source newlines flow within a paragraph, while explicit hard breaks remain visible.

Choose Persian/English in the header. Export settings control RTL/LTR/automatic direction, font and size. Google Fonts requests contain font names only. Document text is processed locally. Mermaid is an image in Word/PDF and LaTeX is editable in Word; surrounding text and code remain editable in Word and searchable in PDF.

Build from the repository root with `pnpm install --frozen-lockfile`, `pnpm run package:vscode`; install the generated VSIX using **Extensions → Install from VSIX…**. `pnpm run test:vscode` runs integration tests in an isolated VS Code profile.

[Source and issues](https://github.com/SoroushJM/ParsiWord) · [SoroushJM](https://github.com/SoroushJM)
