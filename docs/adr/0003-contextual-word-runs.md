# Contextual Word runs and bounded direction marks

Accepted for the 0.2.1 Android preview, 2026-10-21. General device verification of this build remains pending.

The second screenshot disproved the 0.2 "strong RTL characters only" strategy. Subsequent Word Android screenshots of the A/B/C diagnostic show that A (ordinary contextual run properties) and C (A plus LRM boundaries) appear correct in the legible examples. B (nested `w:dir` embeddings) displaced Latin phrases and amounts after the Persian sentence. A's currency order differed from the reference in LibreOffice, so A alone is not sufficient for all supported readers.

Further primary-source research distinguishes paragraph layout, run properties, Unicode context, and formatting boundaries. `w:rtl` overrides neutral character classes and selects complex-script formatting; it must not be applied to strong LTR letters, nor explicitly disabled on strong RTL letters. The standard's own example marks the spaces between Arabic words RTL. An absent run property inherits from its style; this app's styles do not set a default RTL run property. Paragraph direction (`w:bidi`) and alignment remain separate from those run properties. The current library already handles RTL alignment serialization; no extra alignment swap is added. Compatibility mode 15 was already present, so changing that setting is not the chosen fix. The same diagnostic font displayed different results when markup changed; a font change is not a solution to these demonstrated direction failures.

## Implementation

`src/word-direction.ts` groups logical text into contextual spans using Unicode strong character classes and the existing library's bracket-pair data. It does not calculate visual order. Spaces inside Persian phrases keep RTL context. Latin words, numbers, their internal separators and paired punctuation share LTR context. Brackets/quotes containing RTL text use RTL context; pure LTR groups use LTR context. Nested pairs, straight quote apostrophes, combining characters and UTF-16 boundaries are handled without replacing text. Inline code supplies known LTR syntax context while strong RTL characters remain RTL.

The converter computes these spans for the complete paragraph first, then intersects them with Markdown styling and link leaves. Bold, italic or hyperlink boundaries do not restart direction inference. Consecutive linked runs retain a single working hyperlink. `w:rtl` is set only on RTL spans; no `w:dir`, `w:bdo`, global RTL run default, or text reversal is introduced. Explicit `rtl=false` on code blocks is removed; their paragraphs remain LTR.

LRM (`U+200E`) is inserted at the two boundaries of ambiguous LTR phrases in mixed text: numeric identifiers/amounts with separators, leading neutral punctuation, and trailing neutral punctuation. Plain Latin prose and plain numbers receive no extra marks. Existing explicit bidi controls are preserved. These marks are output formatting only; Markdown drafts and the stored source are unchanged. DOCX copy/search can include those invisible characters, which is the tradeoff for preserving group boundaries in readers that do not infer them from Word run properties. Alignment-only comparison mode inserts no marks and applies no run RTL properties.

## Validation and limits

47 unit tests cover paragraph context, the initial device examples, currency, phone numbers, identifiers, dates, percentages, links, paths, quotes/apostrophes, other strong LTR scripts, emoji, formatting across a Latin phrase, hard breaks, inline code and font embedding. Four Playwright tests verify the existing mobile editor and DOCX export flow, including persisted fonts. Android builds for ARM64 and x86_64 are separate verification.

`node scripts/export-verification.mjs` generates four documents through the actual app converter, including the original fixture and a broader synthetic corpus. All four were rendered to PDF in LibreOffice. The broader corpus caught two additional errors before delivery: the exclamation mark in a quoted English phrase and the semicolon after inline code moved to the wrong edge when only ordinary runs were used. Bounded LRM formatting corrected those examples in the rendered output, along with numeric order. This validates why a parentheses-only fix is inadequate.

The phone screenshots validate the diagnostic techniques, not every possible result of the generalized converter. Opening the new exported fixtures in Microsoft Word Android remains the device acceptance check. Plain text can have ambiguous intent, so arbitrary punctuation/number combinations cannot be promised universally correct. This is a compact phrase-context implementation, not a replacement Unicode renderer.

## Primary sources

- [Microsoft, `w:rtl` semantics and strong-script restrictions](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.righttolefttext#remarks)
- [Microsoft, paragraph bidi layout](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.bidi#remarks)
- [Microsoft, mixed-language punctuation, numeric identifiers and the Dynamics (DAT) example](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/user-interface/bidirectional-support)
- [Microsoft, RtlRun](https://learn.microsoft.com/en-us/office/vba/api/word.selection.rtlrun)
- [Unicode, UAX #9 and higher-level protocols](https://www.unicode.org/reports/tr9/#Higher-Level_Protocols)
- [W3C, phrase boundaries and neutral punctuation](https://www.w3.org/International/articles/inline-bidi-markup/index.en)
- [W3C, metadata for direction and numeric strings](https://www.w3.org/TR/string-meta/#augmenting-first-strong-by-inserting-rlm-lrm-markers)
- [Pandoc's ordinary DOCX direction properties](https://github.com/jgm/pandoc/blob/main/src/Text/Pandoc/Writers/Docx/OpenXML.hs#L1269-L1295)
