/** Reproduce the pinned, offline TikZ runtime and font outlines. Never runs at app startup. */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, copyFile, mkdtemp, unlink } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { create } from 'fontkit';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'packages/core/public/tikz');
const version = '1.6.0';
const integrity = 'JQoRqIK3gB8mPAovZ2nZuifVGti51BPgYwo8sUgtjWz/1htI/sVkMOFzoy3qy6VQFcAn1lZZjsYhTVw3lUwdgQ==';
let input = process.argv[2] && resolve(process.argv[2]);
if (!input) {
  const temporary = await mkdtemp(join(tmpdir(), 'parsiword-tikz-'));
  const response = await fetch(`https://registry.npmjs.org/@rod2ik/tikzjax/-/tikzjax-${version}.tgz`);
  if (!response.ok) throw new Error(`TikZ download: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha512').update(bytes).digest('base64') !== integrity) throw new Error('TikZ package integrity mismatch');
  const archive = join(temporary, 'tikz.tgz');
  await writeFile(archive, bytes);
  execFileSync('tar', ['-xzf', archive, '-C', temporary]);
  input = join(temporary, 'package');
}
const metadata = JSON.parse(await readFile(join(input, 'package.json'), 'utf8'));
if (metadata.name !== '@rod2ik/tikzjax' || metadata.version !== version) throw new Error('Unexpected TikZ package');
await mkdir(join(output, 'tex_files'), { recursive: true });
await mkdir(join(output, 'glyphs'), { recursive: true });
const manifest = { package: metadata.name, version, source: 'https://github.com/rod2ik/tikzjax/tree/8228128a03112efd735309bdaa292cca5a3500df', integrity: `sha512-${integrity}`, files: {} };
async function save(name, bytes) {
  const original = name;
  // .gz can trigger Content-Encoding:gzip and transparent HTTP decompression.
  // These are binary TeX assets: the worker, not the HTTP layer, decompresses.
  if (name.endsWith('.gz')) name += '.bin';
  await writeFile(join(output, name), bytes);
  manifest.files[name] = createHash('sha256').update(bytes).digest('hex');
  if (name !== original) await unlink(join(output, original)).catch(error => { if (error.code !== 'ENOENT') throw error; });
}
for (const name of ['run-tex.js', 'tex.wasm.gz', 'core.dump.gz']) await save(name, await readFile(join(input, 'dist', name)));
for (const name of (await readdir(join(input, 'dist/tex_files'))).sort()) {
  if (!/^[a-zA-Z0-9_.-]+\.gz$/.test(name)) throw new Error('Unexpected TeX asset name');
  await save(`tex_files/${name}`, await readFile(join(input, 'dist/tex_files', name)));
}
for (const name of (await readdir(join(input, 'dist/fonts'))).sort()) {
  const font = create(await readFile(join(input, 'dist/fonts', name)));
  const glyphs = {};
  for (const code of font.characterSet) {
    const glyph = font.glyphForCodePoint(code);
    glyphs[code] = [glyph.advanceWidth, glyph.path.toSVG()];
  }
  await save(`glyphs/${name.replace(/\.woff2$/, '.json.gz')}`, gzipSync(JSON.stringify({ unitsPerEm: font.unitsPerEm, glyphs }), { level: 9 }));
}
await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
await copyFile(join(input, 'LICENSE'), join(output, 'LICENSE-GPL-3.0.txt'));
await copyFile(join(input, 'dist/run-tex.js.LICENSE.txt'), join(output, 'run-tex.js.LICENSE.txt'));
console.log(`Vendored TikZ ${version}: ${Object.keys(manifest.files).length} runtime/glyph assets.`);
