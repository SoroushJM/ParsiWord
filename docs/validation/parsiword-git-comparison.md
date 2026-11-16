# ParsiWord Git comparison validation

## Editor-picker Loading recovery — 0.1.12, 2026-10-31

Selecting **ParsiWord Git Comparison** from VS Code's editor picker creates a
legacy two-webview wrapper using the comparison provider for both children.
The old provider treated each child as a standalone comparison: without an
original revision, its `ready` handler reopened another editor and returned
without sending `init`, leaving the old panes on **Loading ParsiWord…**. A
previously saved original could instead create a comparison inside one child,
preventing promotion of the complete pair.

The provider now restores a saved original only for its own standalone custom
tab, initializes wrapper children without reopening editors, and promotes the
ordered Timeline pair to the shared comparison workspace. A genuinely missing
original produces a warning with a readable document in the same tab. Message
handlers are registered before assigning HTML so a cached module's first
`ready` cannot precede the subscription.

The installed 0.1.11 host reproduced the editor-picker failure in an isolated
profile. The pre-fix local host also failed reopening a previously compared
pair. With the fix, the actual Windows VS Code **1.144.0** comparison run passed
**38 checks** (working tree, staged, Undo/Redo, Timeline and first/repeated picker
selection). The final historical run passed **6 checks**, including the added
missing-original case. All four content/layout combinations, read-only commit
identity, native Diff URI identity and retained tabs are covered. The shared
protocol/diff suites passed **18 tests**; TypeScript, build, architecture and
whitespace checks passed.

Local evidence: `artifacts/picker-loading-installed-exact.log`,
`artifacts/picker-loading-installed-failure.json`,
`artifacts/picker-loading-warm-before.log`,
`artifacts/picker-loading-regression.log`,
`artifacts/picker-loading-history-final.log`,
`artifacts/picker-loading-unit.log` and `artifacts/vscode-test/results.json`.
The packaged `artifacts/parsiword-vscode-0.1.12.vsix` was installed locally.
SHA-256 checks match the tested host, manifest, entry script and stylesheet:
`artifacts/picker-loading-installed-hashes.json`. No push or CI run was used.
After reloading the user's existing VS Code window, the previously stuck
`README.md (e20e4dab) ↔ README.md (d4a28bc9)` tab opened as one comparison
workspace with visible red/green source highlights, exact revision labels and
both commits read-only. This was checked in the user's actual installed app,
in addition to the isolated integration profile.

## Timeline commit comparisons — 2026-10-31

Comparing two historical commits used to open two ordinary ParsiWord panes
without change decoration. Automatic promotion recognized Git/file and
HEAD/index pairs only, so the arbitrary commit refs used by Timeline never
entered the comparison workspace.

The host now recognizes Timeline's ordered commit refs and promotes that
wrapper to the existing single-tab comparison. Both historical documents stay
read-only. The tab and revision headers show the commit identifiers instead of
calling historical revisions HEAD/index. Source/rendered content, side-by-side
and inline layouts, and the optional native Text Diff preserve the exact pair.

VS Code's stable tab API exposes a legacy custom-editor diff as an unknown
input. Promotion therefore requires exactly two visible ParsiWord panes in the
same editor group, and matches both URI refs against Timeline's ordered title.
It never infers revision order from asynchronous pane creation or commit hash
sorting. Explicit native text diffs and ordinary custom-editor tabs are excluded.
Custom comparison titles without identifiable commit refs are not guessed.
The title format is defined in VS Code's
[Git Timeline command](https://github.com/microsoft/vscode/blob/2c33b50b16c472efe58357d1d2a8a5414bc23fbf/extensions/git/src/commands.ts#L4412).

The new actual-host fixture creates three local commits and opens the same
`vscode.diff` URI/title combination as Timeline. The unmodified host reproduced
the missing workspace. The final focused comparison run passed **36 checks**
in Windows VS Code **1.144.0**, including existing working-tree/staged editing
and Undo/Redo checks plus historical comparisons in both orders, all four
content/layout combinations, native diff content and URI identity, multiple
retained comparison tabs, and reopening with the original commit restored.
The protocol/diff unit suites passed **18 tests**. Extension build, TypeScript,
architecture boundaries and `git diff --check` also passed.

Local evidence: `artifacts/history-diff-before.log`,
`artifacts/history-diff-regression.log`, `artifacts/history-diff-unit.log`,
`artifacts/vscode-test/results.json` and
`artifacts/vscode-test/history-diff-source-side-by-side.png`.
Run `PARSIWORD_TEST_FOCUS=diff` with the VS Code test runner to cover both the
existing Git comparison suite and the new historical cases; `history-diff`
selects just the new cases. These checks do not require a push or a CI run.

Extension **0.1.7** exposes **RTL / LTR / Auto** in the shared comparison toolbar
and replaces the large Word action with compact, direct **Word** and **PDF**
buttons. Forced RTL/LTR now also applies to source text and inline source review;
Auto retains independent paragraph detection. On 2026-10-27, the focused real
VS Code 1.143.1 comparison suite passed **33 checks**, including all three
directions in both content views and layouts, exact Markdown preservation, and
the narrow webview. The source browser suite passed **8 tests**, including native
caret/highlight wrapping in all three directions at narrow and desktop widths.
The extension build and architecture check passed. Evidence:
`artifacts/direction-toolbar-vscode.log`, `artifacts/direction-source-browser.log`,
and `artifacts/vscode-test/git-diff-direction-toolbar-fa.png`.
The packaged `artifacts/parsiword-vscode-0.1.7.vsix` was installed successfully;
SHA-256 checks of the installed host, webview manifest, entry script and stylesheet
match the tested build (`artifacts/direction-toolbar-installed-hashes.json`).

Extension **0.1.6** adds optional built-in VS Code comparison and fixes RTL
numbered-list indentation in ordinary and comparison previews. Its local
checks and native-release workflow verification are recorded separately in
[rtl-lists-and-native-releases.md](rtl-lists-and-native-releases.md).

Date: 2026-10-26. Target extension: **0.1.2**. Test host: Windows, installed VS Code **1.143.1**; browser checks use installed Chrome.

Follow-up: **0.1.3** adds real Word/PDF Markdown image embedding and fixes the CI rendered-Undo test's accidental click on an image. Its fresh full-suite evidence is recorded in [image-exports.md](image-exports.md); the 0.1.2 results below are retained as historical evidence.

**Extension 0.1.2 was packaged and installed from the final verified build.** The implementation and acceptance coverage below describe the current single-tab comparison. Full-suite results are distinguished from focused checks performed after the final presentation changes.

| Final verification | Result / evidence |
| --- | --- |
| Shared unit suite | `pnpm test`: **1,102 tests in 31 files passed**, exit 0 |
| Browser suite | **61 tests passed**, exit 0, installed Chrome with one worker (2.8 minutes). Log: `artifacts/single-tab-browser-sequential-final.log`. The subsequent change is scoped to source-inline comparison spacing; ordinary website views are unaffected |
| Real VS Code full suite and comparison checks | **65 full-suite checks passed** in VS Code 1.143.1; the final focused rerun passed **31 checks**, including compact source/rendered fragments and exact source newlines. Logs: `artifacts/vscode-full-single-tab-final.log`, `artifacts/diff-single-tab-focused-source-inline-final.log`; exact result lists: `artifacts/vscode-test/results-full-single-tab-verified.json`, `artifacts/vscode-test/results-focused-source-inline-final.json`. The full run preceded the final presentation-only spacing/Tailwind changes; the focused 31-check run used the final build |
| Architecture check | `pnpm run check:architecture` passed |
| Web and extension builds | Both final builds passed after the Tailwind replacements and source/rendered Inline spacing fixes. Logs: `artifacts/web-build-final.log`, `artifacts/extension-build-final.log`. Both TypeScript configurations passed |
| VSIX package and installed-extension verification | Final `parsiword-vscode-0.1.2.vsix` packaged successfully (227 files, 5.18 MB), then installed with `code.cmd --install-extension --force`, exit 0. Logs: `artifacts/single-tab-package-final.log`, `artifacts/extension-install-final.log`. SHA-256 hashes of the installed host, manifest and current webview entry JavaScript/CSS match the final build exactly; recorded in `artifacts/extension-installed-final-hashes.json` |
| `git diff --check` | Passed after final documentation edits |
| Visually inspected screenshots | Opened source side-by-side, rendered side-by-side, rendered inline, source inline, image and actual narrow-webview captures. Both final inline views have compact rows; the SVG visibly paints on both rendered sides; controls remain inside the narrow webview |

For historical context, extension 0.1.1 passed 45 real-host checks, including nine comparison and six shortcut checks; its shared unit suite passed 1,045 tests in 27 files and its browser suite passed 59 tests. Those results validated the previous paired-editor architecture and do not establish the status of 0.1.2. The user's appearance reference is the compact shell already present at commit `66617ae`, documented in [display-theme-and-native-shell.md](display-theme-and-native-shell.md). The current work extends that shell with existing shadcn controls; authored absolute UI dimensions use `rem`.

## One comparison tab and one native document history

A comparison opens one ordinary `CustomTextEditorProvider` editor for the modified `TextDocument`. One webview contains the original and modified ParsiWord views. Moving, closing or reopening the comparison operates on that whole tab; the revisions no longer open in separate VS Code editor groups. Source Control's legacy custom-editor diff wrapper is promoted to this comparison tab and closed. ParsiWord's Git diff commands open the same comparison directly.

This uses the stable custom text editor API, without the proposed `customEditorDiffs` API. The modified `TextDocument` owns edits, dirty state, saving and native Undo/Redo. The original revision and inline review fragments never own editable drafts. The existing source ledger preserves Markdown spelling when the rendered editor changes text. Decorations and review fragments are excluded from saved Markdown and exports.

The host drains pending synchronization before Save and Undo/Redo, preserves pending drafts, then reveals the requesting comparison before dispatching the native history command. Source input remains a native textarea and rendered input remains the existing Tiptap editor. Their canonical instances stay mounted while content mode or layout changes. No additional comparison undo stack is introduced.

Reloading a webview first drains or recovers the previous session's queued edits with publication paused. It then creates a new pending-edit journal and acknowledgement identity before initializing the new client. This prevents its first edit sequence being mistaken for an old sequence, while preserving the same native `TextDocument` and Undo history.

Working-tree comparisons use index versus working tree. Staged comparisons use HEAD versus index, with both sides read-only. Git rename metadata supplies the original path when available. The original URI is retained in workspace/webview state so a reopened comparison can restore its revision. Image resource roots are reconfigured when the original document changes.

The integration fixture contains Persian and English, a path containing a space, an original commit, different index and working-tree versions, and a relative SVG asset. The history check creates unrelated native-editor undo history before editing the comparison, then asserts actual `TextDocumentChangeReason.Undo` and `Redo` events on the intended working document. It also compares original/unrelated text and saved bytes. Dirty-state-only events are excluded from history assertions because they contain no text changes.

## Four comparison views

The toolbar exposes independent content and layout choices inside the same tab:

| Content | Side by side | Inline |
| --- | --- | --- |
| Markdown source | Original read-only source beside current source, with red/green line backgrounds and stronger changed-word spans | One ordered review stream of removed source followed by added source |
| Rendered result | Original read-only ParsiWord result beside the current editable result; source ranges mark changed blocks | One ordered review stream of removed and added rendered Markdown blocks |

Inline is a read-only review. **Edit current version** opens the canonical modified editor at full width; **Review changes** returns to the combined review stream. Editing never writes a concatenation of old/new fragments back into the document. Find, Replace or Go to Line invoked during inline review opens the modified editor and routes the action there. Staged comparisons retain their read-only restriction.

Previous/next controls navigate source changes in side-by-side mode and actual review groups in inline mode. Rendered review uses complete source blocks and each revision's reference definitions so links and reference images resolve inside isolated fragments. It does not claim character-precise rendered changes inside a block. Bounded diff work falls back to a coarser changed region for pathological inputs while retaining both revisions' content in order. Large source/token counts use the existing plain-text fallback.

Side-by-side panes have a pointer- and keyboard-operable divider. Original stays left and modified stays right; text direction is handled inside each pane. Shared document controls sit above both revisions, and compact source/rich toolbars occupy the same starting row. The original toolbar is visible but disabled. Toolbar/search IDs and search highlight names are scoped per editor.

Side-by-side scrolling is linked in both directions for source and rendered results. It maps visible source positions through paired diff boundaries, then through measured line/block positions in the other revision; it does not assume both documents have the same height. Sticky controls are excluded from the reading edge. Programmatic target scrolls are suppressed as input so they cannot continually drive each other. Layout, font and image changes invalidate measured positions; source/rendered switches retain a logical reading position. Scroll synchronization changes viewport positions only, leaving text, selection and history ownership unchanged. Inline review uses its own single scrolling surface.

Each side-by-side column has a viewport of noninteractive trailing scroll space. A shorter revision can therefore align its last shared block at the reading edge even when the other column wraps more lines. Focused input changes refresh measurements after an idle delay; actual scrolling still synchronizes immediately. Rendered inline review overrides the ordinary editor's minimum document height, so short change fragments fit their content instead of becoming full editing canvases. Source-inline spans preserve literal newlines and use native preformatted wrapping; they do not create an extra block with minimum height for each fragment's empty terminal line.

Direction, font family and size selected through shared controls apply to both rendered sides and inline review. The original's display settings can change without editing its Markdown. Shared exports capture the modified document and its current settings. Outside Git comparison, the ordinary editor retains source, rendered and combined modes. Native hunk staging remains in VS Code's native text diff editor; ParsiWord does not implement native hunk-stage buttons.

## Markdown images and local base folders

Inline and reference-style Markdown images render through existing raw-source atoms. Original syntax, alt text, title and reference spelling remain available for editing and Markdown export. Images have accessible alt text and an explicit failure fallback. A viewBox-only SVG receives its decoded natural width in `rem`, bounded by the containing pane, to prevent a loaded image collapsing into an invisible atom.

VS Code resolves relative image paths against the document directory, including spaces. Original Git documents use the file path in their Git URI as the base. Local files must exist inside document directories or open workspace roots; the webview receives an `asWebviewUri` resource. An explicit base URI must match the current/original document. HTTPS images and supported raster data images are accepted. Remote credentials, unsupported schemes, control characters and ungranted local paths are rejected; resource delivery remains subject to the webview Content Security Policy.

Original Git images currently read assets from the current filesystem. Historical binary image contents are not fetched from Git, so a deleted or changed asset can differ from the historical Markdown revision.

The website adds bilingual **Local image base folder** controls. Users select a document/project folder through the browser directory picker, with a compatible `webkitdirectory` fallback. Browsers cannot read an arbitrary typed `C:\...` path without explicit selection. An optional document-folder field such as `docs/notes` supports Markdown URLs containing `../` within the selected project root. Encoded spaces and non-Latin filenames work; traversal outside the selected root is rejected.

Selected files remain local through object URLs. Directory handles are read lazily; cached URLs are revoked on clear, replacement or unmount. Clearing/reselecting a base re-resolves unchanged Markdown image URLs. Selection lasts for the current page session. Without a selected base, ordinary relative URLs resolve against the hosted page; HTTPS and permitted image data URLs continue to work. Folder selection does not upload files.

This adds display and source preservation. Word/PDF image embedding remains unsupported, as stated in the existing export warning. Local base-folder selection is implemented for the website, not as a new native Android/desktop filesystem picker.

## Ordinary shortcuts retained

The user-confirmed scope is recorded in [ADR 0007](../adr/0007-vscode-ui-history-and-shortcuts.md). Multi-cursor editing and selecting multiple occurrences are outside this stage. Real-host tests use installed-workbench keyboard input and the OS clipboard, rather than substituting synthetic events or command calls for the shortcuts under test.

- Source/rendered Copy, Cut, Paste and Select All use native clipboard paths. Movement, selection, Ctrl+Home/End, Shift+End, Ctrl+S and native Undo/Redo remain in scope. Whole-document rich replacement/cutting must undo to the exact original Markdown.
- Ctrl+F searches literal Unicode text without modifying the document. Match case, F3/Shift+F3, Enter/Shift+Enter and Escape remain supported. Undo in the query field belongs to that field. F3 preserves Replace controls when Replace is open.
- Ctrl+H supports literal Replace One/All, including replacement strings containing `$&`. Rich replacement spans inline marks within a block, uses the source ledger and participates in native Undo.
- Ctrl+G accepts a Markdown line and optional column. Source positions map to exact raw offsets. Rendered navigation reveals the corresponding block; it does not claim an exact raw column inside rendered syntax.
- Ctrl+P, Ctrl+Shift+P, Ctrl+Tab and Ctrl+Shift+Tab retain workbench Quick Open, Command Palette and tab navigation. Host bindings remain customizable and do not intercept quick-input fields.
- Original revisions support search while replacement/editing controls stay disabled. Search is scoped to the focused side. Actual webview focus and comparison side are reported because panel activation can lag input. Top-level Save/Undo/Redo explicitly target the modified document.

Search is literal, without regex/whole-word mode. Counts and navigation cover all matches; decorative highlights are bounded to 2,000 matches plus the active match. Source decoration stays `aria-hidden`; IME, forced-colors and oversized-source fallbacks remain. Windows bindings are exercised locally; contributed macOS bindings have not been executed on macOS.

## Reproduction and acceptance coverage

Run `pnpm run test:vscode` for the full real-host suite in an isolated profile and disposable Git repository. It also covers native source/preview, actual Word/PDF/Markdown exports, shared views, external changes, both IME event orders, delayed acknowledgements/conflicts, disposal recovery, editor modes, oversized recovery, save cancellation, CRLF and narrow-toolbar keyboard traversal. It does not edit the user's project or personal VS Code profile.

After `pnpm run build:vscode`, focused PowerShell runs are:

```powershell
$env:PARSIWORD_TEST_FOCUS = 'diff'
node apps/vscode/scripts/test.mjs
Remove-Item Env:PARSIWORD_TEST_FOCUS

$env:PARSIWORD_TEST_FOCUS = 'shortcuts'
node apps/vscode/scripts/test.mjs
Remove-Item Env:PARSIWORD_TEST_FOCUS
```

The comparison suite asserts one comparison tab, source/rich highlighting, both layouts, inline review/edit transitions, shared controls, pointer/keyboard resizing, read-only revisions, native history, per-side search, visible loaded images, staged comparisons and reopening. Image checks require nonzero natural width and visible bounds, not merely a valid `src`. Inline spacing checks measure short rendered fragments and source-line height; source checks also assert the exact original text and terminating newline.

Shared tests cover unchanged/CRLF text, separated additions/deletions, Persian/ZWNJ, whitespace/Markdown syntax, empty/final-newline changes, emoji boundaries, coarse comparison and exact source retention. Protocol cases reject malformed comparison/restoration/focus/image fields and URI fields beyond 8,192 characters. Image cases cover inline/reference parsing, preserved source, URL schemes, selected-root traversal, encoded paths, lazy reads, caching and URL revocation.

Browser folder-image cases in `tests/local-images.spec.ts` select actual fallback directories, verify inline/reference images and viewBox-only SVG visibility, clear/reselect an unchanged URL, exercise an explicit document subfolder and rejected native picker, and compare Markdown bytes. The installed-Chrome override is:

```powershell
pnpm exec playwright test --config artifacts/playwright.config.ts tests/local-images.spec.ts
```

The completed logs and preserved result lists are identified above; `artifacts/vscode-test/results.json` also contains the final 31-check result. The suite writes workbench captures including `git-diff-source.png`, `git-diff-preview-side-by-side.png`, `git-diff-preview-inline.png`, `git-diff-source-inline.png`, `git-diff-images.png`, `git-diff-narrow.png`, `git-diff-dark.png` and `git-diff-staged.png`. Opened final captures are recorded in the verification table. Previous 0.1.1 artifact names remain historical evidence.
