# Linked Markdown and preview selections

On 2026-10-27, extension 0.1.8 adds bidirectional peer highlights to ParsiWord's
source/result workspace. Selecting in either editor paints the corresponding
text blue in the other. Native focus, selection, clipboard and document history
remain with the editor being used. Mobile pane switches retain the highlight.

Mapping uses the rich source ledger's encoded units and original block offsets,
including repeated labels and blocks, entities, escapes, astral Unicode, nested
lists/quotes, table cells and fenced code. Selecting a source-only link URL or
formatting delimiter identifies its rendered owner. CRLF source positions are
translated to the textarea's LF offsets. No text search or source rewrite is
used. The first selection maps only touched blocks; subsequent selections reuse
their cached maps. Source DOM decoration retains the existing large-document
limits and forced-colors/composition fallbacks. CSS Custom Highlights require a
supporting browser/WebView; this was verified in installed Chrome and VS Code's
Chromium webview, not on a physical Android device.

Local validation:

- `pnpm exec vitest run packages/core/src/rich-source.test.ts`: 63 passing tests,
  including 13 new selection cases and a parse-count assertion proving that
  repeated selection in one block does not parse the other 79 blocks.
- `PW_CHROME_CHANNEL=chrome pnpm exec playwright test tests/linked-selection.spec.ts --workers=1`:
  7 passing tests in Chrome, covering Auto/RTL/LTR, duplicate blocks, source-only
  syntax, plain source, desktop/mobile, edits, undo and reload.
- The source, rich-input and scroll-sync browser suites: 15 passing tests,
  including Persian IME, native caret/mirror alignment, immediate export and
  editing-limit behavior. Log: `artifacts/linked-selection-regressions.log`.
- `pnpm run build:vscode` and `pnpm run check:architecture`: passed.
- After the build, run `PARSIWORD_TEST_FOCUS=linked-selection node apps/vscode/scripts/test.mjs`
  (set the environment variable using the local shell). Actual VS Code 1.143.1
  passed all three native checks: correct repeated-block mapping, native copy
  from both surfaces, unchanged CRLF/dirty state on selection, rich replacement
  and shared Undo. Log: `artifacts/linked-selection-vscode.log`.

The opened screenshot `artifacts/vscode-test/linked-selection-vscode.png` shows
the second identical phrase selected in Preview and highlighted on the correct
Markdown line. The native test is also included in the full VS Code test runner.

The production web build also passed. A local production typing measurement
used the starter document plus the fixed input paragraph (30,661 characters),
a 393 × 851 viewport, 4× CPU throttling, and 32 native inputs spaced 35 ms apart.
Median/p95 time from `beforeinput` to the first animation frame was 53/76 ms in
Preview and 29/35 ms in source. Source retained all 1,339 original line nodes,
changed only input line 2, matched the final native text and recorded zero stale
highlight frames. These are single local Chrome measurements, not an Android
device result or a before/after performance comparison. Detailed records:
`artifacts/linked-selection-preview-profile.json` and
`artifacts/linked-selection-source-profile.json`.

The packaged `artifacts/parsiword-vscode-0.1.8.vsix` was installed locally.
SHA-256 verification of the installed host, webview manifest, entry script and
stylesheet matches the tested build; see
`artifacts/linked-selection-installed-hashes.json`.
