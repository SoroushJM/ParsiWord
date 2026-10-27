import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Check actual checkout bytes before packaging; Git EOL filters must never
// silently change a pinned WASM runtime or its JavaScript loader.
const directory = new URL('../packages/core/public/xetex/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
for (const name of ['busytex.js', 'busytex.wasm.gz.bin', 'tex.data.gz.bin', 'files.json']) {
  const bytes = await readFile(new URL(name, directory));
  const expected = manifest.files[name];
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (!expected || bytes.length !== expected.bytes || hash !== expected.sha256) {
    throw Error(`XeLaTeX asset integrity mismatch: ${name}. Check Git EOL filters or re-vendor from pinned inputs.`);
  }
}
console.log('Pinned XeLaTeX assets verified (4 files).');
