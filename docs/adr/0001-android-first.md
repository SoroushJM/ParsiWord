# Android first, with a shared document conversion core

Status: accepted for the first prototype, 2026-10-21.

The user is on Android and wants to start with an installable Android application, then investigate parentheses in exported Word documents. Other operating systems remain a future goal.

Use React and TypeScript for editing, preview and DOCX generation, hosted by Tauri 2. Android document open/save uses the official dialog and filesystem plugins and the system document picker. No server or Microsoft Word automation is needed for conversion. The user can choose where to save a file.

This shares most application code with future desktop and iOS targets, at the cost of maintaining Rust and platform build tools. Other platform builds, distribution and their file-provider behavior are not verified by this prototype.

Treat alignment and reading direction as separate settings. The normal export records paragraph direction and text-run direction in OOXML, using resolved Unicode bidi levels for mixed text. Keep logical text and parentheses unchanged. A clearly marked alignment-only export permits comparison on the user's device. This does not establish that the original reported problem has been reproduced or fixed; no failing source document was supplied.

Images, equation conversion, PDF, Mermaid and full Microsoft Word editing are outside the first prototype. Preserve unsupported image alt text in DOCX and expose the limitation in settings.
