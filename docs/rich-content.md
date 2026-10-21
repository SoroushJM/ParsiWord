# LaTeX and Mermaid

Inline math uses `$...$`; block math uses `$$` on separate lines. Fenced `math`,
`tex` or `latex` also creates a display equation. This supports KaTeX math
expressions, not full LaTeX documents, packages, macros from earlier blocks,
or arbitrary TeX execution. Ordinary code fences and escaped brackets remain
literal; `\\(` and `\\[` are not globally rewritten.

The shared remark-math parser recognizes equations in preview and export.
KaTeX creates local MathML, mathml2omml creates Office Math, and the public
`docx` XML builder serializes it as a native `m:oMath` child. Fractions, roots,
sub/superscripts, sums, integrals and matrices are covered. XML entities are
preserved until the XML parser consumes them (`disableDecode: true`), so `<`
and `&` cannot become broken XML. Unsupported MathML is refused explicitly;
a structured integrand is attached to an empty n-ary operand to avoid a
visible placeholder. A regression test covers this library boundary;
formulas are never silently reduced to literal LaTeX or a screenshot.

Mermaid uses a fenced `mermaid` block. Its bundled engine is loaded when used;
no server receives document text. Preview is SVG; Word gets a local PNG,
scaled to the page, with source in its alternative text. Formulas remain
editable in Word; diagrams are editable through the original Markdown. A
small shared cache avoids repeating diagram work; rendering is serialized.
Flowchart and sequence exports are tested in an actual browser. Less common
Mermaid diagram types are available through the bundled engine but have not
all been visually tested. Interactive links, external resources and HTML
labels are disabled. Invalid diagrams stop export and explain the problem.

KaTeX trust is disabled, macro expansion and input sizes are bounded, Mermaid
uses strict security, SVG resource references are checked, and PNG creation is
bounded to 4096 pixels on either axis. Formula source is limited to 20,000
characters and diagram source to 50,000. These are resource bounds, not a
claim that every possible valid expression is supported.

Licenses and the unmodified mathml2omml distributed module are included under
`public/licenses`; see its NOTICE and LGPL/GPL texts. The source distribution
allows rebuilding with a modified library. Native Word Android rendering is
still a separate device check from the XML and browser tests.

In 0.4.1, Word math explicitly names the bundled STIX Two Math face in document
math settings, runs and control properties, and embeds its complete MATH-capable
TTF. Noto Sans Mono and Persian fallback faces travel with code and mixed text.
LibreOffice may still use its own math renderer/font choices; embedding a font
does not force an external reader to honor it. The independent font verifier
checks what the file actually contains rather than inferring from screenshots.
