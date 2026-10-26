# Offline TikZ source and reproduction

ParsiWord vendors `@rod2ik/tikzjax` **1.6.0**. These archives preserve the
corresponding upstream worker and WebAssembly compiler sources alongside
the application's public source. Each archive retains upstream licensing,
build scripts and dependency lockfiles. The application's runtime notices
are in [`packages/core/public/tikz/NOTICE.txt`](../../packages/core/public/tikz/NOTICE.txt).

| Archive | Upstream revision | SHA256 |
| --- | --- | --- |
| `sources/tikzjax-8228128a03112efd735309bdaa292cca5a3500df.zip` | `rod2ik/tikzjax@8228128a03112efd735309bdaa292cca5a3500df` | `16ee38da198b5f4c4f09a4e10fab2a954307cb4eb7ea4b68285698d123c3a083` |
| `sources/web2js-41a84ed7199e694a74c519fbde5a93e7ca5be76c.zip` | `rod2ik/web2js@41a84ed7199e694a74c519fbde5a93e7ca5be76c` | `eb6e5d458208fa6d648240271d538d54ab77d195605e6fed0ae7202c370e6898` |

To reproduce the exact assets and generated outlines used by ParsiWord:

```sh
pnpm install --frozen-lockfile
node scripts/vendor-tikz.mjs
```

The script downloads the exact npm archive, verifies its SHA512 before
extraction, copies the unmodified worker/TeX gzip bytes, generates font
outlines with the pinned fontkit version, and writes SHA256 for all 400
runtime/glyph files in `packages/core/public/tikz/manifest.json`. It accepts
an already extracted npm package directory as its first argument for
offline reproduction. License texts and NOTICE are maintained separately
and remain in the public directory. The `.gz.bin` suffix is intentional:
HTTP servers must deliver compressed bytes without transparently treating
these application data files as Content-Encoding gzip.

To modify and rebuild the engine instead, extract the Web2js archive and
follow its README and Dockerfile. The build requires Node/Yarn, TeX Live,
`tie`, `tangle` and Binaryen (`wasm-opt`). Its build runs the WEB compiler,
Asyncify transformation and `scripts/build/initex.js` preloading recipe.
The original `tex.web` and `etex.ch` files stay unchanged; the compiler
applies separate change files as their notices require. The resulting
`dist/tex.wasm.gz` matches ParsiWord's published npm runtime. A new format
dump depends on the locally installed TeX Live files and therefore need
not match the historical published core byte for byte.

The TikZJax archive contains its webpack build, source, yarn.lock,
`installFonts.mjs`, TeX-file manifest and npm publish workflow. Its
published package intentionally selects the known-good `rod2ik/cdn`
runtime at revision `0937b0722b5385b61d7f45265342a769d2640d0a`;
the npm core's gzip SHA256 is recorded in NOTICE. Its TeX source files
remain unmodified in the runtime and retain their individual headers.

ParsiWord's integration changes are ordinary readable TypeScript in
`packages/core/src/tikz.ts` and `tikz-svg.ts`, plus `scripts/vendor-tikz.mjs`.
The runtime uses one restricted local worker, termination on timeout,
bounded caches and SVG sanitization. Font labels become self-contained
SVG paths before rasterization. It does not modify the upstream worker
or turn a subset of TikZ commands into a separate drawing language.
