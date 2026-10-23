# Core API boundaries

`@parsiword/core` remains one workspace package. Choose the smallest public entry
for the environment that imports it:

| Entry | Purpose |
| --- | --- |
| `@parsiword/core/document` | Settings and direction types, validation, document limits, session controller, shared Markdown context and definitions |
| `@parsiword/core/host` | Node-safe host services, messages and validators, synchronization, pending edits, settings contracts and errors |
| `@parsiword/core/ui` | React `EditorApp`, `LocaleProvider`, display theme hook and types |
| `@parsiword/core/styles.css` | Shared globals, application and locale styles in their existing order |
| `@parsiword/core/adapters/word` | Word builders and exports, including prepared-context export |
| `@parsiword/core/adapters/pdf` | PDF exports and assets; load this entry dynamically |
| `@parsiword/core/adapters/files` | Host-backed Markdown open and Word/PDF/Markdown save operations |
| `@parsiword/core/adapters/fonts` | Font catalogue, download, cache and document font preparation |
| `@parsiword/core/errors` | Stable failure codes, translation keys and type guards |

The web/Tauri entry and the VS Code webview import `/ui` and `/styles.css`.
The extension process imports `/host`, which has no DOM, React, font binary,
PDFKit or output adapter dependency. `ExportSettings` and `Direction` belong to
the document model rather than the Word converter.

The root entry keeps its existing `EditorApp`, `LocaleProvider`, `configureHost`,
host types, `defaultSettings`, `ExportSettings` and `exportWord` API. Existing
`./*` deep paths also remain available during migration. New host consumers use
the explicit entries. The old `DocumentPreview` deep path is deprecated and
retained only for compatibility; the active editor uses `EditablePreview` and
the shared document grammar. Do not reintroduce that compatibility renderer into
the root or UI dependency graph.

PDF stays outside the initial editor module graph. Import the adapter only when
the user invokes PDF export:

```ts
const { exportPreparedPdf } = await import('@parsiword/core/adapters/pdf');
const bytes = await exportPreparedPdf(context, settings, fonts);
```

Do not re-export PDF from `/ui` or the aggregate root. Native SDKs and VS Code
APIs belong in `apps/`; core receives services through `configureHost`.

## Known failures

Throw `new ParsiWordError(code, { cause })` for a known operational failure.
`RichContentError` remains an `Error` subclass and adds the same stable `code`;
its legacy string constructor remains available for existing integrations.
`errorMessages` maps codes to the Persian locale keys used by the existing
translation provider. Every key has an English translation.

```ts
import { errorMessage, getErrorCode, ParsiWordError } from '@parsiword/core/errors';

throw new ParsiWordError('FILE_OPEN_FAILED', { cause });
// In the UI: t(errorMessage(error, fallbackLocaleKey))
// For control flow: getErrorCode(error) === 'FILE_TOO_LARGE'
```

`getErrorCode` accepts whitelisted object codes, including serialized host
errors. It does not infer a code from `message` or arbitrary strings. A host
response transports `errorCode` separately from diagnostic text, validates it
with `isErrorCode`, and reconstructs `ParsiWordError` in the webview. The Tauri
font IPC command currently returns exact `FONT_NETWORK` or `FONT_TOO_LARGE`
strings; the native adapter converts that documented IPC contract at the
boundary. Display code never searches for those strings inside error text.

The `FONT_*` codes distinguish catalogue, network, storage, size, format and
missing-family failures. File, math, diagram, PDF layout/image and host sync
failures have separate codes in `errors.ts`. Cancellation and synchronization
conflicts are distinct from successful saves. Unknown failures use the caller's
existing translated fallback; their cause remains available for diagnosis.

## Automated guard and CI

Run `pnpm run check:architecture` to inspect real TypeScript import, export,
dynamic import, `require`, import-equals and import-type edges. The guard blocks
host SDKs/Node builtins and relative imports of host implementations from core,
protects the Node-safe host/document graphs, keeps PDF lazy, and enforces the
shared Markdown grammar owner. Fixture tests cover rejected and accepted edges;
a separate bundled Node smoke test executes the public host entry without DOM
globals.

The existing VS Code verification workflow now runs unit tests, the architecture
guard, the web production build and Chromium tests before the native extension
checks. Its change filters include core (including CSS), web/Tauri frontend,
webview, extension, tests, scripts and relevant configuration. Pages deployment
and platform packaging workflows retain their existing publication behavior.
