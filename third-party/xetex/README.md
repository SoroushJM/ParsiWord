# Local XeLaTeX runtime

ParsiWord adapts an existing TeX compiler, not a new implementation of TeX.
The unmodified busytex.js/WASM inputs and TeX Live 2025 bundles come from
[Siglum v0.1.0](https://github.com/SiglumProject/siglum/releases/tag/v0.1.0).
Every downloaded input and generated executable/data asset has a SHA-256 in
`scripts/vendor-xetex-inputs.json` / `packages/core/public/xetex/manifest.json`.
The digest is authoritative; these vendor assets were not rebuilt locally
from C/C++ source.

The upstream Siglum release source revision is
`2a44e46f216d04bf52235cae271cd5e31c881a92`. Its BusyTeX submodule source is
`fbaaee98ef8f2d3717a1b01ca4cea222fc33a82f`; the complete BusyTeX source/build
recipe archive is retained in `sources/busytex-source.zip`. It contains the
Emscripten build, TeX Live 2025.0 source URL, component URLs and patches.
Upstream source and build instructions:

- https://github.com/SiglumProject/siglum/tree/2a44e46f216d04bf52235cae271cd5e31c881a92
- https://github.com/SiglumProject/busytex/tree/fbaaee98ef8f2d3717a1b01ca4cea222fc33a82f
- https://github.com/TeX-Live/texlive-source/tree/tags/texlive-2025.0

XePersian, bidi and enumitem are overlaid from pinned CTAN distributions;
zref is overlaid from its pinned TeX Live archive. Original archives, including
the upstream package notices and available documented sources, are retained
under `sources/`. Archive URLs and digests are pinned in the input manifest.
Vazirmatn regular/bold font files come from the existing app font distribution.

ParsiWord changes: curate runnable files from the larger data bundles; combine
them into an indexed gzip pack; overlay the packages/fonts above; append
`shell_escape=f`, `openin_any=p`, `openout_any=p` to the in-memory TeX config;
add `worker.js` for isolated local XeLaTeX/XDV/PDF jobs. Package source files,
engine JS and WASM are otherwise unmodified. The worker and TypeScript adapter
are ParsiWord source. Reproduce these assets with:

```sh
node scripts/vendor-xetex.mjs
```

TeX Live is a collection with individual licenses, not one MIT-licensed
product. Preserve source-file headers and upstream notices when redistributing.
Siglum and BusyTeX declare MIT for their own code. XeTeX retains its permissive
notice; xdvipdfmx and other compiled TeX programs retain their individual
GPL/permissive terms. LaTeX, XePersian, bidi and many TeX packages use LPPL;
PGF permits GPL/LPPL, PGFPlots GPL v3 or later; Latin Modern fonts use the GUST
Font License; Vazirmatn uses SIL OFL. Full available notices/license texts are
distributed beside the runtime, including the TeX Live copying conditions.
Corresponding upstream TeX sources are available at the TeX Live source tag
above; the BusyTeX archive contains build and dependency retrieval recipes.
