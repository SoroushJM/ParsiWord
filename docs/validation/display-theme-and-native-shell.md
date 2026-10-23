# Display theme and native VS Code shell

The accepted web design keeps its existing branding and responsive layout.
Display preferences use independent system/light/dark storage; changing them
does not change Markdown or export settings. Desktop web icon targets are 32px;
mobile web targets remain 44px. Native source typing, bidi, composition and
measurement stay in the textarea. Semantic rich paragraphs use document
direction rather than the source textarea's plaintext bidi policy.

## Web visual evidence

The prescribed `pnpm run ui:capture` helper produced these real Chromium images,
with the requested display preference seeded only in a temporary profile:

| Capture in `artifacts/` | Viewport | Scope |
| --- | --- | --- |
| `implementation-theme-desktop-light.png` | 1366×900 | Existing web identity, compact controls, light document |
| `implementation-theme-desktop-dark.png` | 1366×900 | Dark source and rich surfaces |
| `implementation-theme-320-en-light.png` | 320×780 | English interface, narrow preview |
| `implementation-theme-mobile-source-dark.png` | 393×851 | Dark mobile source |
| `implementation-theme-mobile-rich-dark.png` | 393×851 | Dark mobile rich view |
| `implementation-theme-320-rich-dark-scrolled.png` | 320×780 | Scrolled sticky view switch and toolbar |
| `implementation-theme-document-dark.png` | 1366×900 | Text, code, equations, table and diagram |
| `implementation-theme-document-dark-final.png` | 1366×900 | Final equation color correction and integrated document rendering |

These were individually viewed and reviewed by the supervisor. The capture
reports record resolved theme and stored preference; none reported horizontal
page overflow. Existing source/rich browser checks also covered native caret
alignment, wrapping, Persian composition/selection, scrolling and view changes.

After the equation color correction, the focused Chromium suite passed all 11
theme, source and syntax-highlighting tests. It compares live KaTeX color with
document text in light and dark modes, verifies identical Word document XML
across display choices, and retains the source metric/IME/forced-colors and
32px/44px target checks. The final capture was opened for inspection; its report
records no horizontal overflow, source height and scroll height both 560px,
and the requested dark preference and resolved theme.

## Native shell design delta

The user subsequently required the extension to look native to VS Code. This is
an extension-only variant, selected by the webview's `body.vscode-shell` marker:

- UI and portalled settings/menu/toast typography use VS Code font family and
  size tokens. Source/rich document typography remains separately controlled.
- A small text brand and language action replace the website's large logo area.
  Hero heading, description, illustration, marketing footer and personal-draft
  subtitle are hidden; native commands and the direction control remain.
- The workspace is flat, without the website's outer padding, rounded card or
  card shadow. The document title remains editable in a compact export row and
  in export settings.
- Native controls are 26px with 16px icons and 2px corners; pane headings are
  28px. Narrow formatting toolbars use one horizontal row with native scrollbar
  colors and normal keyboard focus. Web density and mobile touch targets stay
  unchanged.
- Native input, button, hover, widget and focus colors come from workbench
  tokens. Text links/caret/focus use their own host tokens rather than the
  button background token.

The before images are preserved as
`artifacts/implementation-vscode-before-native-shell.png`,
`artifacts/implementation-vscode-before-math-dark.png`, and
`artifacts/implementation-vscode-before-icons-hc.png`.

Native evidence before this shell refinement verified all four actual VS Code
themes, including High Contrast Light carrying both
`vscode-high-contrast vscode-high-contrast-light` classes. The resolver now
prioritizes the explicit light class; unit cases cover both class orders.
Dark KaTeX and pane-heading icons received additional display-only color rules
after visual review exposed their low contrast. The subsequent native run on
VS Code 1.143.1 measured the following actual host colors:

| Host theme | Source, rich text and math contrast | Pane icon contrast |
| --- | --- | --- |
| Default Light Modern | 11.20:1 | 5.94:1 |
| Default Dark Modern | 10.26:1 | 7.16:1 |
| Default High Contrast | 21.00:1 | 7.01:1 |
| Default High Contrast Light | 14.55:1 | 8.98:1 |

All four transitions retained `body.vscode-shell`, matching VS Code's Segoe UI
font token at 13px while the source remained Vazirmatn at 14px and rich content
retained its selected document font. Controls measured 26px; panel radius was
0px and shadow was `none`. Source focus used the host focus color. The four
`artifacts/vscode-test/shell-vscode-*.png` images were opened and inspected.

The first 400px native traversal exposed a partly clipped focused equation
button in the rich toolbar. The extension toolbar now explicitly scrolls its
focused control into view with nearest alignment and instant motion, retaining
space for the focus outline. The earlier failure was followed by a successful
bounded native rerun: all 31
native checks passed. Actual 400px combined/source/rendered webviews had no
horizontal page overflow. Tab traversal reached all 20 enabled controls across
the combined source/rich toolbars, all five source-only controls, and all 15
rendered-only controls with the focused button fully visible. The final
`artifacts/vscode-test/narrow-combined.png`, `narrow-source.png`, and
`narrow-rendered.png` images were opened and inspected. Complete measurements,
body classes and control bounds are retained in
`artifacts/vscode-test/results.json`.

A final visual review caught source code/formula spans missing specifically in
High Contrast Light. A focused native witness established the cause:
`textPreformat.foreground` was white while `editor.background` was also white,
so the source math/code tokens had 1:1 contrast even though ordinary source
text passed. Contrast themes now use `editor.foreground` for source
emphasis/math/code and document inline code. The matching after witness records
`rgb(41, 41, 41)` and 14.55:1 contrast for every source math/code/Mermaid span,
with the textarea and decorative overlay both retaining the exact original
document. `artifacts/vscode-test/syntax-hc-light-before.png` and
`syntax-hc-light-after.png` were opened and compared; their JSON counterparts
retain the actual host tokens and per-span measurements. The normal four-theme
native CI loop now also checks nonempty source math and code token sets and
their contrast, rather than relying on the container text color alone. This
last CSS correction used the focused native witness; the earlier 31-check
native report remains preserved.

Mermaid retains its intrinsic light SVG palette on a white display canvas. Its
content remains readable, and cached SVG/PNG output is never mutated by display
theme changes. This does not claim the diagram image itself has a dark palette.
Equation display selectors are scoped under `.prose`; the separate PDF formula
rasterizer keeps its fixed export colors.
