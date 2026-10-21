# Scoped RTL groups and missing delimiter glyphs, 0.2.3

The user's original Word Android screenshot confirms that 0.2.2 renders S09 correctly, but fails S11 and the mixed-script catalogue cells such as P01/P02. P04/P05 and P44–P48 display missing-glyph boxes. See the device evidence in `../rtl-hard-stress.md`. This decision extends ADR 0003 for LTR paragraphs; the device-confirmed RTL-paragraph strategy stays in place.

## Direction changes

The previous rule made a pair RTL whenever it contained any RTL characters. In LTR prose, a mixed bracket group now follows its first strong script. Thus `(React و فارسی)` retains LTR outer punctuation; `[مرحلهٔ اول (React 19)]` has an RTL outer group and an LTR inner expression. Code ranges retain their existing treatment. Neutral/number-only groups keep their contextual behavior. Existing Unicode bracket data and canonical-equivalence APIs are retained.

For the second example, independent run properties cannot retain the intended nested phrase scope. A bounded RLE (U+202B) before the complete RTL bracket group and PDF (U+202C) after it supplies that missing context. These are Unicode embedding controls, not an override or visual text reversal. Only mixed RTL bracket groups inside LTR paragraphs receive them. Nested groups covered by an existing generated scope do not add further embedding depth. Scope boundaries are computed before Markdown style/hyperlink/font splitting, balance within each paragraph, and survive hard line breaks. Explicit author-supplied embeddings/isolates suppress automatic embeddings. Alignment-only mode adds no direction controls.

The existing bounded LRM assistance remains. Generated controls appear only in DOCX; the Markdown draft is unchanged. Copying/searching exported text can include invisible LRM/RLE/PDF characters. No source bracket is substituted, mirrored by hand, normalized or reordered. `w:dir`/`w:bdo` are not emitted: a local selective `w:dir` probe did not fix S11, and the earlier full embedding experiment was rejected by device evidence. Standard `docx` run and paragraph APIs remain in use.

Automatic paragraph detection neutralizes known bracket characters before invoking bidi-js. This prevents its older Unicode data from incorrectly treating newly assigned brackets as strong Latin letters.

## Font changes

The fourteen characters observed missing have a dedicated 4,112-byte TrueType fallback, **ParsiWord Symbols**. It is a renamed, losslessly traced subset of GNU Unifont 18.0.01, distributed under SIL OFL 1.1 with upstream attribution. The upstream bitmap subset, provenance, license and reproducible `scripts/build-delimiter-font.py` are included. No runtime download is needed.

Only those fourteen characters select the fallback in all four Word font script slots; selected prose/code fonts and Markdown styling remain intact. The face is embedded only in documents that use it. The same face is available to the browser preview. Other missing glyphs outside this observed set remain dependent on selected/viewer font coverage. Mobile readers can differ in support for embedded fonts; device confirmation is pending.

## Evidence

- 777 unit tests and 4 Playwright tests pass; TypeScript and Vite builds pass.
- The updated stress expectations distinguish both mixed-content orders and both paragraph directions, rather than enforcing the faulty blanket-RTL rule.
- Tests check all 65 official pairs for paragraph detection, all 72 delimiters for mixed LTR cells, balanced scopes, preservation across styles/hyperlinks, comparison mode, existing explicit scopes, the confirmed S09 path, rare-glyph font assignments and embedding, and bounded depth with 4,000 nested groups.
- The short actual-converter DOCX renders as two pages. S11 and P01/P02 match their independently authored image references in LibreOffice; S11 PDF word coordinates also establish `Read < React < Persian phrase < then` in visual left-to-right order.
- All fourteen glyphs are visible in the rendered native text. `pdffonts` confirms that the PDF uses the embedded `ParsiWordSymbols-Regular` face, without installing that font locally.
- The full actual-converter stress DOCX still renders as ten pages. S09 retains its known LibreOffice discrepancy; its Word Android path was deliberately preserved based on the user's confirmed device result.
- Version 0.2.3 Android Word rendering remains pending. Local rendering and structural assertions are not a claim of final device verification.
