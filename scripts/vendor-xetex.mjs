/** Reproduce the self-contained XeLaTeX runtime. This is a maintainer command,
 * never a startup download and never an upload of a user's document. */
import { readFile, writeFile, mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inputs = JSON.parse(await readFile(join(root, 'scripts/vendor-xetex-inputs.json'), 'utf8'));
const input = process.argv[2] ? resolve(process.argv[2]) : await mkdtemp(join(tmpdir(), 'parsiword-xetex-'));
const output = join(root, 'packages/core/public/xetex');
const hash = data => createHash('sha256').update(data).digest('hex');
await mkdir(output, { recursive: true });
async function load(name) {
  const info = inputs[name];
  if (!info) throw new Error(`Unpinned XeTeX input: ${name}`);
  const path = join(input, name);
  let bytes;
  try { bytes = await readFile(path); } catch {
    const response = await fetch(info.url);
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
  }
  if (hash(bytes) !== info.sha256) throw new Error(`XeTeX input integrity mismatch: ${name}`);
  return bytes;
}
const files = new Map();
const original = JSON.parse((await load('file-manifest.json')).toString());
// Keep runnable TeX/metrics/outline fonts and formats; upstream bundles also
// contain large manuals, source fonts and example PDFs which the engine never reads.
const selected = Object.keys(inputs).filter(name => name.startsWith('bundles/'));
for (const name of selected) {
  const bundle = name.slice(8, -8), data = gunzipSync(await load(name));
  for (const [path, item] of Object.entries(original)) {
    if (item.bundle !== bundle || !/^\/texlive\/texmf-dist\/(?:tex\/|web2c\/|texmf-var\/|fonts\/(?:tfm|vf|type1|enc|map|opentype)\/|dvips\/)/.test(path)) continue;
    if (!/\.(?:tex|sty|cls|clo|cfg|def|fd|ldf|ltx|ini|cnf|fmt|map|enc|tfm|vf|pfb|otf|pro|pat|dat)$/i.test(path)) continue;
    if (item.end > data.length || item.start < 0 || item.end < item.start) throw new Error(`Invalid bundle bounds: ${path}`);
    files.set(path, data.subarray(item.start, item.end));
  }
}
for (const name of ['xepersian', 'bidi', 'enumitem']) {
  const zip = await JSZip.loadAsync(await load(`${name}.zip`));
  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir || !/^(?:tex\/|enumitem\/enumitem\.sty$)/.test(path)) continue;
    files.set('/texlive/texmf-dist/' + (path.startsWith('tex/') ? path : 'tex/latex/enumitem/enumitem.sty'), await file.async('nodebuffer'));
  }
}
await load('zref.tar.xz');
const zref = join(input, 'zref'); await mkdir(zref, { recursive: true });
execFileSync('tar', ['-xf', join(input, 'zref.tar.xz'), '-C', zref]);
for (const name of await readdir(join(zref, 'tex/latex/zref'))) files.set(`/texlive/texmf-dist/tex/latex/zref/${name}`, await readFile(join(zref, 'tex/latex/zref', name)));
for (const name of ['Vazirmatn-Regular.ttf', 'Vazirmatn-Bold.ttf']) files.set(`/${name}`, await readFile(join(root, 'packages/core/public/fonts', name)));
// The default TeX configuration permits a shell. Even with --no-shell-escape,
// keep every layer explicit and restrict TeX's view to its in-memory filesystem.
files.set('/texlive/texmf-dist/web2c/texmf.cnf', Buffer.concat([files.get('/texlive/texmf-dist/web2c/texmf.cnf'), Buffer.from('\nshell_escape = f\nopenin_any = p\nopenout_any = p\n') ]));
let offset = 0; const entries = [], chunks = [];
for (const [path, data] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
  entries.push([path, offset, data.length]); chunks.push(data); offset += data.length;
}
const assets = {
  'busytex.js': await load('siglum-busytex.js'),
  'busytex.wasm.gz.bin': gzipSync(await load('busytex.wasm'), { level: 9 }),
  'tex.data.gz.bin': gzipSync(Buffer.concat(chunks), { level: 9 }),
  'files.json': Buffer.from(JSON.stringify(entries)),
};
for (const [name, data] of Object.entries(assets)) await writeFile(join(output, name), data);
for (const name of Object.keys(inputs).filter(name => name.startsWith('LICENSE'))) await writeFile(join(output, name), await load(name));
await writeFile(join(output, 'LICENSE-GPL-3.0.txt'), await readFile(join(root, 'packages/core/public/tikz/LICENSE-GPL-3.0.txt')));
await writeFile(join(output, 'LICENSE-Vazirmatn-OFL.txt'), await readFile(join(root, 'packages/core/public/fonts/OFL-Vazirmatn.txt')));
const sources = join(root, 'third-party/xetex/sources');
await mkdir(sources, { recursive: true });
for (const name of ['busytex-source.zip', 'xepersian.zip', 'bidi.zip', 'enumitem.zip', 'zref.tar.xz']) await writeFile(join(sources, name), await load(name));
await writeFile(join(output, 'manifest.json'), JSON.stringify({ version: 1, source: 'https://github.com/SiglumProject/siglum/releases/tag/v0.1.0', inputs, files: Object.fromEntries(Object.entries(assets).map(([name, data]) => [name, { sha256: hash(data), bytes: data.length }])), unpackedBytes: offset }, null, 2) + '\n');
console.log(`Vendored XeLaTeX: ${entries.length} files, ${offset} unpacked bytes; ${Object.values(assets).reduce((sum, data) => sum + data.length, 0)} download bytes.`);
