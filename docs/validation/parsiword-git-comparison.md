# ParsiWord Git comparison validation

Date: 2026-10-26. Extension **0.1.1**, Windows, installed VS Code **1.143.1**.

The full integration suite passed **45 checks**, including nine comparison checks and six shortcut checks. The shared unit suite passed **1,045 tests in 27 files**; the browser suite passed **59 tests** using installed Chrome with two workers. `pnpm run check:architecture`, `pnpm run build`, `pnpm run build:vscode` and `git diff --check` also passed. Vite retains its existing large-chunk size advisory.

The user's appearance reference already exists at commit `66617ae`, documented in [display-theme-and-native-shell.md](display-theme-and-native-shell.md). This checkout was three commits behind; it was fast-forwarded to `40cd53f` before integrating comparisons. The existing compact native shell, three editor modes and resizable workspace are preserved. Authored extension dimensions are expressed in `rem` at the existing proportions.

## Comparison behavior and Undo repair

Source Control's `git.openChange` initially supplies a legacy custom-editor diff wrapper. That wrapper did not reliably route native Undo after other native editors had been focused. The repair opens the two ParsiWord custom text editors in adjacent VS Code editor groups and closes the wrapper tab. Both sides keep ParsiWord's source/rich UI. Git diff commands open this pair directly. Before Undo/Redo, the requesting panel is revealed so the native command targets its own document after asynchronous synchronization.

There is no extra browser or per-comparison undo store. A strengthened integration test leaves a different native document with saved undo history, opens the Git comparison, edits the working side, and checks actual `TextDocumentChangeReason.Undo` and `Redo` events on the intended document. It also checks that the unrelated document and original revision remain unchanged and that Ctrl+S writes the expected bytes. Dirty-state-only events are excluded from the change-reason assertion because they contain no text changes.

The comparison fixture contains Persian/English text, a path containing a space, one committed version, a different index version and another working-tree version. Checked behavior:

- Source Control opens two ParsiWord custom editors with visible red/green line backgrounds and stronger changed-word spans.
- Working-tree comparisons use index versus working tree; staged comparisons use HEAD versus index. Revision source and rich content are read-only. The working document stays editable.
- Previous/next controls navigate both sides to the same change. Both rendered previews highlight changed source blocks. Decorations never enter saved Markdown or exports.
- Persian/English controls and dark-theme diff colors remain usable. The full suite also checks the native shell across Light, Dark and both High Contrast themes.
- Git diff commands use the same paired comparison. Returning to ordinary Markdown clears comparison decoration. After reloading VS Code, reopen the comparison from Source Control or Git diff to restore its pairing.
- Native hunk staging and inline diff remain available through the native text diff editor; those controls are not implemented in the ParsiWord comparison.

The full run continues through native source/preview, actual Word/PDF/Markdown exports, multiple shared views, external disk edits, both IME event orders, delayed acknowledgements and conflicts, disposal recovery, all editor modes, oversized document recovery, cancelled save, CRLF and keyboard traversal of narrow toolbars. When the comparison helper closes its editors, subsequent tests reopen their TextDocument and reacquire view references rather than inspecting disposed instances.

## Reproduction and evidence

Run `pnpm run test:vscode` for the full real-host suite in an isolated profile and Git repository. After building, the focused checks can run in PowerShell with `$env:PARSIWORD_TEST_FOCUS='diff'` followed by `node apps/vscode/scripts/test.mjs`.

Local evidence: `artifacts/diff-full-final.log`, `artifacts/vscode-test/results.json`, `artifacts/diff-unit-final.log`, `artifacts/diff-browser-final.log`, `artifacts/diff-architecture-final.log`, `artifacts/diff-web-build.log` and `artifacts/diff-build-final.log`. Actual workbench screenshots are `artifacts/vscode-test/git-diff-source.png`, `git-diff-preview.png`, `git-diff-dark.png` and `git-diff-staged.png`; source and dark screenshots were visually inspected. These tests do not edit the user's repository or personal profile.

Seven shared comparison cases cover unchanged/CRLF text, separate insertions/deletions, Persian words and ZWNJ, whitespace/Markdown syntax, blank/empty/final-newline changes, emoji boundaries and bounded coarse comparison. Host protocol tests reject malformed comparison metadata and navigation indices. Rich previews highlight blocks; precise changed words appear in source. The existing composition, forced-colors and very-large-source plain-text fallbacks remain in place.

## Ordinary shortcut validation

The user confirmed the ordinary shortcut scope in [ADR 0007](../adr/0007-vscode-ui-history-and-shortcuts.md); multi-cursor editing and selecting multiple occurrences are excluded. Tests send real keyboard input through the installed workbench and actual webviews rather than dispatching synthetic keyboard events or calling the target command in place of a keypress.

- Source Ctrl+A/C/X/V is checked against the OS clipboard and native document. Ctrl+Y, Ctrl+Z, Ctrl+Home/End and Shift+End are exercised. Rendered Ctrl+A/C/X/V also uses the native clipboard; Undo restores the exact original Markdown after replacing or cutting the entire rich document.
- Ctrl+F finds literal Unicode text and paints matching DOM ranges without changing the document; match-case, F3/Shift+F3, Enter/Shift+Enter and Escape are checked. Ctrl+Z inside the query field does not alter Markdown. F3 keeps the Replace controls visible when that mode is open.
- Ctrl+H replaces all source matches as literal text (including `$&`), with one native Undo restoring the document. Rich search spans inline marks within a block; rich replacement uses a single transaction through the existing source ledger, then native Undo restores the original Markdown. Source comparison tests also exercise Replace One and Undo.
- Ctrl+G accepts a Markdown line and optional column. Source tests assert the exact caret offset; rendered-only tests assert focus and selection in the mapped Markdown block. Rich navigation does not claim an exact raw Markdown column inside rendered syntax.
- Ctrl+P and Ctrl+Shift+P open the actual workbench pickers. Ctrl+Tab and Ctrl+Shift+Tab change real editor tabs; the test holds Control until the workbench picker appears, then releases it, matching native quick-navigation behavior.
- The original Git revision supports search while Replace controls stay disabled; Cut/Paste/Undo do not modify the revision or working file. Search/replace on the modified side reaches that document's native history. Focus is reported from the actual webview, because `panel.active` alone remained on the other editor group in a reproduced two-panel test.

The search bar uses the established compact shell and existing shadcn controls. It stays visible while navigating matches. Counts/navigation cover all matches; decorative highlighting is bounded to 2,000 matches plus the active match. Existing IME, very-large-document and forced-colors input fallbacks remain intact. Search is literal text, without regex or whole-word modes in this release. The host keybindings are customizable and do not intercept workbench quick-input fields.

After building, focused shortcut checks use `$env:PARSIWORD_TEST_FOCUS='shortcuts'` followed by `node apps/vscode/scripts/test.mjs`. Additional actual workbench evidence is in `artifacts/vscode-test/shortcuts-source.png` and `shortcuts-rendered.png`; the source search and dark comparison screenshots were opened for visual inspection. Runtime protocol tests reject unsupported editor actions and malformed focus messages. Windows VS Code was executed; macOS bindings are contributed but were not run on macOS.
