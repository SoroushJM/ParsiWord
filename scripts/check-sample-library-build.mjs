import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const [mode, folder = 'dist'] = process.argv.slice(2);
assert.ok(mode === 'enabled' || mode === 'disabled', 'Usage: node scripts/check-sample-library-build.mjs enabled|disabled <build directory>');
const assets = resolve(folder, 'assets');
const files = (await readdir(assets)).filter(name => /\.(?:js|css)$/.test(name));
const chunks = files.filter(name => name.startsWith('SampleLibrary'));
const contents = (await Promise.all(files.map(name => readFile(join(assets, name), 'utf8')))).join('\n');
for (const marker of ['sample-library-dialog', 'parsiword-personal-samples-v1', 'ragged-extra']) {
  assert.equal(contents.includes(marker), mode === 'enabled', `${mode} build has incorrect sample-library marker: ${marker}`);
}
assert.equal(chunks.length > 0, mode === 'enabled', `${mode} build has incorrect sample-library chunks`);
console.log(JSON.stringify({ mode, assets, libraryChunks: chunks.length, passed: true }));
