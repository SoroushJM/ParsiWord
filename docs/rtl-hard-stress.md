# Paired-delimiter stress test, 0.2.2

The user requested a difficult Word test with all opening/closing delimiters, explicitly including `< >`, `《 》` and `{ }`, and reuse of an existing Word direction library where available.

## Ready-made APIs

The current `docx` library exposes [TextRun.rightToLeft](https://docx.js.org/api/types/index.IRunStylePropertiesOptions.html) and [Paragraph.bidirectional](https://docx.js.org/api/types/index.IParagraphPropertiesOptionsBase.html). The converter continues to use those public APIs. It does not hand-write their XML or substitute another renderer. Inspection of the installed 9.13.0 declarations and the published APIs found no standalone `RtlRun`/`LtrRun` method. Microsoft's actual [Selection.RtlRun](https://learn.microsoft.com/en-us/office/vba/api/word.selection.rtlrun) executes inside Word; [Office.js](https://learn.microsoft.com/en-us/office/dev/add-ins/word/word-add-ins-core-concepts) is also an API for an add-in hosted by Word. These are not drop-in offline Android DOCX writers. No extra commercial dependency or desktop-Word dependency was introduced. Exact equivalence to a Word desktop command before/after save remains unverified.

The OpenEdition reference explains adding Word ribbon direction commands in the user's visible screenshot. Its full page is blocked by Anubis here. The screenshot and the independent Microsoft API references inform this distinction; the full article has not been read.

## Corpus and independent evidence

The unmodified official [Unicode 18 BidiBrackets.txt](https://www.unicode.org/Public/18.0.0/ucd/BidiBrackets.txt) snapshot, copyright and license are under `tests/fixtures/unicode/`. It contains **65 pairs**. Seven extra ASCII-angle / quotation pairs give **72** catalogue entries. This is a precise coverage definition, not a claim to recognize every punctuation convention in every language. Ornate non-mirroring parentheses and mathematical self-delimiters have different Unicode semantics; the main corpus includes code containing `|x|` and `‖y‖` without inventing bracket properties for those characters.

`tests/fixtures/rtl-stress.ts` supplies 14 labelled semantic cases S01–S14 and one deliberately malformed case E01. Cases cover Persian-only and mixed text, ASCII and CJK angles, braces, square brackets, straight/curly quotes, apostrophes, nested signs, amounts/phone numbers, style/link boundaries, hard/automatic line wrapping, RTL text inside LTR text, canonical equivalents, literal HTML-like text, emoji and ZWNJ. E01 tests character retention; it has no claimed correct pairing.

`scripts/export-hard-stress.mjs` creates the native text with the actual app converter, then uses the public `docx` document API to append two reference image pages. Chromium renders those images using **hand-authored direction scopes**, independently from the production segmenter. The file has stable S/P identifiers for device screenshots. Shape and line wrapping can differ by font/view; compare group placement and reading order.

## Reproductions and focused fixes

Before the fixes, the 437 initial stress checks produced **27 failures**. These are repeated matrix failures, not 27 distinct bugs. The installed bidi-js data lacks five newer Unicode bracket pairs and excludes ASCII `< >` from its paired-bracket database. Single guillemets were also not covered by the app's quotation map. The old implementation cleared the matching stack at a line break inside a paragraph. An unmatched interior comparison delimiter could also prevent an enclosing pair from being matched.

The implementation still prefers bidi-js's existing pair and canonical-bracket APIs. A licensed Unicode 18 fallback supplies missing pairs and their normative ON character class. ASCII angles and single guillemets are handled as explicit application delimiters. Matching persists across lines of the same paragraph; the converter already calls the function independently for separate paragraphs. A closing-character index allows an enclosing pair to recover after an unmatched interior opener while keeping matching linear. Canonically equivalent CJK angle forms match without normalizing the stored characters.

The 0.2.2 suite passed **489 unit tests** and **4 Playwright tests**. Automated checks validate complete text and delimiter retention through Markdown and real DOCX serialization, all 72 catalogue rows, two base directions, three payload types, three document direction modes, font/link/style/break structure, and 4,000 nested pairs. They do not prove visual correctness in Microsoft Word.

## Known visual results

The generated DOCX opens and renders to a ten-page PDF in LibreOffice. **S09 and S11 differ from their independent references** there: hard-line-break punctuation and an RTL phrase containing LTR text in an LTR paragraph. They must not be called solved merely because the structural assertions pass. Some rare/new delimiter glyphs can be unavailable in the viewer's font; each catalogue row includes its Unicode code points to distinguish missing glyphs from missing characters.

### Word Android device review, 2026-10-21

The user's original screenshot was recovered from their 7z attachment at 540 × 9580 pixels. The earlier inline copies were only 72 × 1280 and could not support character-level judgments. The original starts at S07: S01–S06 are absent from the native text capture, although their raster reference appears at the end.

- **S09 matches its reference in Word Android.** The LibreOffice difference does not reproduce in this device screenshot.
- **S11 fails in Word Android.** The square-bracketed Persian phrase containing `(React 19)` loses its intended grouping compared with the independent reference. Flat run directions do not preserve the nested phrase scope.
- **Mixed catalogue cells also fail**, visibly P01 and P02: closing-shaped delimiters appear before `React`, with the opposite delimiters after the Persian continuation. The existing matcher assigns both delimiters RTL whenever any enclosed RTL text exists, even for an LTR paragraph. A read-only reproduction confirms that `(React و فارسی)` and `[React و فارسی]` have LTR paragraph bases but RTL delimiters. Independent Unicode embedding levels for the outer delimiters are both 0. This evidence identifies an overly broad rule; those levels alone are not a replacement Word-run implementation.
- **P04, P05 and P44–P48 show missing-glyph boxes.** This is a separate font-coverage issue, not evidence that the exporter deleted those characters; serialization retention is covered by the automated tests.
- E01 is deliberately malformed and is not a visual-pairing failure.

The screenshot confirms remaining failures; no converter change or replacement APK was made during this review. The 489 passing unit tests did not establish these visual properties. In particular, the stress matrix's blanket expectation of RTL brackets around mixed content must be reconsidered when implementing the correction. The private screenshot is not embedded in public artifacts.

Artifacts are `artifacts/hard-stress/ParsiWord-hard-stress.docx`, its `.md` source, reference images and manifest. The Markdown source has no added directional control characters; the exporter may add bounded LRM formatting as documented in ADR 0003. No personal screenshot/document is embedded. The next implementation should address mixed content in LTR paragraphs, retain the confirmed S09 behavior, and include visual checks independent of the production direction rule.

## 0.2.3 implementation after device review

The observed failures are addressed by the scoped direction and font changes in [ADR 0004](adr/0004-nested-rtl-in-ltr.md). The suite now passes 777 unit tests and 4 Playwright tests. New output is under `artifacts/0.2.3`; `scripts/export-fix-check.mjs` produces a short two-page device check, and `scripts/export-hard-stress.mjs ../artifacts/0.2.3/` produces the full ten-page corpus. S11 and mixed LTR cells match their independent references in local rendering; all 14 fallback glyphs are visible. S09's confirmed Word Android path is preserved. New Word Android confirmation remains pending.
