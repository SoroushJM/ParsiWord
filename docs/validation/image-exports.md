# Markdown image export validation

Date: 2026-10-26. Image embedding introduced in extension **0.1.3**, followed by the comparison scrollbar alignment fix in **0.1.4**. Local host: Windows, VS Code **1.143.1** and installed Chrome. This follows the user's request to prioritize actual image embedding in Word/PDF and resolve the failed GitHub extension check.

## Behavior

The export snapshot's canonical Markdown context supplies both inline and reference-style images, with the first matching reference definition. The site uses the selected local image base folder and document subfolder; the extension reads document-relative local or HTTPS bytes through its host. Data URLs bypass the native URL protocol. Images are decoded, bounded and normalized to PNG locally, then embedded into the DOCX/PDF. No image files or Markdown are uploaded to an image conversion service.

Word retains editable surrounding text, image metadata and image hyperlinks. Image dimensions fit the usable page, list/quote insets and fixed table columns, preserving aspect ratio. Only image-containing paragraphs use an at-least line height, avoiding the normal text spacing multiplier on a tall image. Ordinary paragraph styles remain unchanged.

PDF retains searchable vector text and fonts. Raster image dimensions are converted from intrinsic 96dpi units to physical points. Images fit page/table bounds without slicing; tall table images reserve the actual repeatable header height. Missing, invalid, oversized or blocked images stop export with a translated error rather than producing an incomplete document. Site HTTPS images need CORS permission; selecting a local copy is the available alternative.

## Completed local checks

| Check | Evidence |
| --- | --- |
| Full shared unit suite | **1,133 tests, 34 files, exit 0**, `artifacts/image-export-all-unit.log` and final `artifacts/image-export-unit-final.log` |
| Focused real VS Code image export | **4 checkpoints, exit 0**, `artifacts/image-export-native.log` and `artifacts/vscode-test/results-image-export.json` |
| Full real VS Code suite on final rebuilt code | **71 checkpoints, exit 0**, `artifacts/image-export-native-ci-final.log` and `artifacts/vscode-test/results-image-export-ci-final.json`; includes the deterministic narrow comparison regression |
| Browser local-folder exports and missing-image errors | **2 tests, exit 0**, `artifacts/image-export-browser.log` |
| Full browser suite, including all seven actual image decoders | **65 tests, exit 0**, `artifacts/image-export-browser-full.log` |
| Production web build | **exit 0**, `artifacts/image-export-web-build.log`; the existing large-bundle advisory remains |
| Architecture and TypeScript checks | `pnpm run check:architecture` and `pnpm exec tsc --noEmit`, exit 0 |
| Actual PDF appearance | Opened Poppler rendering `artifacts/image-export-review/browser-images.png`: visible SVG circle and colored PNG, mixed Persian/English searchable text, no clipped images |
| VSIX and personal-profile installation | `artifacts/parsiword-vscode-0.1.4.vsix` packaged and installed with `code.cmd --install-extension --force`, exit 0. All 223 packaged runtime/resource files matched SHA-256; `artifacts/image-export-package-final.log`, `artifacts/image-export-install-final.log`, `artifacts/image-export-installed-hashes-final.json` |

The native fixture includes a viewBox-only SVG circle with two radii and a reference-style colored PNG in a path containing spaces. Tests require both loaded editor resources, used DOCX media relationships, real normalized PNG signatures/dimensions, preserved aspect ratios, editable text and exactly two PDF image paint operations beside searchable text. The original Markdown must remain byte-exact after both exports. Actual extracted DOCX media were opened and checked, and the rebuilt DOCX image paragraphs contain `lineRule="atLeast"`.

Unit layout regressions inspect physical image bounds in PDF, linked images, and a tall portrait table producing exactly one/two pages with a searchable header and actual image on every page. Loader cases cover deduplication, canonical definitions, CORS/network failures, stream cancellation, input/output/pixel/count limits, timeouts, tainted canvas and temporary resource cleanup.

## GitHub failure diagnosis

The previous [extension check](https://github.com/SoroushJM/ParsiWord/actions/runs/40345172845) failed during rendered Git comparison Undo. Its failure screenshot showed the image markup dialog open: clicking the rich editor's center had hit an SVG atomic block after viewport resizing. The test then typed into that dialog, whose local Undo correctly remained isolated. Both rendered history checks now click a specific final text paragraph, require no dialog and assert rich-editor focus before pasting/Undo. The exact Markdown restoration assertion and original timeout remain. The rebuilt full native run passes that failure point and all comparison/history checks.

The [next run](https://github.com/SoroushJM/ParsiWord/actions/runs/40352737530) passed the complete editor job and rendered Undo, then exposed a separate narrow-pane rendered scroll failure. Reproduction at a fixed 1024-by-768 desktop viewport produced the same 9.59375-unit heading difference. Both source scroll directions passed. Direct DOM measurements showed a classic horizontal scrollbar making only the narrower rich toolbar taller (43 versus 33 measured units). The source mapping was exact; the unequal sticky reading insets caused the visible difference.

Version 0.1.4 reserves the same horizontal scrollbar track for both source/rich formatting rows in VS Code side-by-side comparisons. Ordinary editors, the site, mobile and inline review retain their existing behavior. The scroll hook observes header size changes and releases detached observer targets when search controls/editor surfaces are replaced. The regression now fixes the CI viewport, verifies equal toolbar occupancy, requires real overflow in the narrower rich row, and retains the original strict common-heading alignment, exact Markdown and no-feedback assertions.

## Deployed image exports

The [Pages deployment](https://github.com/SoroushJM/ParsiWord/actions/runs/40352737683) succeeded. An actual installed-Chrome session on the public English site selected a local image folder, then downloaded and inspected both formats: the DOCX contained two used image media entries and the PDF contained exactly two image paint operations with searchable surrounding text. Markdown remained exact. Evidence: `artifacts/image-export-live-exports.json`, `artifacts/image-export-review/live-images.docx` and `artifacts/image-export-review/live-images.pdf`.

## Reproduction

```powershell
pnpm test
pnpm run check:architecture
pnpm run build
pnpm exec playwright test --project chromium
pnpm run test:vscode

# Focus only on the real host's image-export flow:
$env:PARSIWORD_TEST_FOCUS = 'image-export'
pnpm run test:vscode
Remove-Item Env:PARSIWORD_TEST_FOCUS
```

The installed-Chrome override used locally is `--config artifacts/playwright.config.ts`. GitHub installs the Playwright-managed Chromium binary. Tests use isolated browser/VS Code profiles and disposable files; the user's project Markdown is untouched. This work does not claim a fresh Android APK build or device test.
