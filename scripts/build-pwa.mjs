import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const template = fileURLToPath(new URL('../apps/parsiword/pwa/sw.js', import.meta.url));

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  }));
  return files.flat();
}

export async function buildPwa(outDir) {
  const essentials = [
    'index.html', 'en/index.html', 'manifest.webmanifest', 'en/manifest.webmanifest',
    'icon.png', 'pwa-icon-192.png', 'pwa-icon-512.png', 'font-catalogue.json',
  ];
  const bundled = await Promise.all(['assets', 'fonts'].map(async folder => filesIn(join(outDir, folder))));
  const paths = [...essentials, ...bundled.flat().map(path => relative(outDir, path).split(sep).join('/'))].sort();
  const digest = createHash('sha256');
  for (const path of paths) {
    digest.update(path);
    digest.update(await readFile(join(outDir, path)));
  }
  const version = digest.digest('hex').slice(0, 16);
  const source = await readFile(template, 'utf8');
  await writeFile(join(outDir, 'sw.js'), source
    .replace('__CACHE_VERSION__', version)
    .replace('__PRECACHE_FILES__', JSON.stringify(paths)));
  console.log(`PWA service worker: ${paths.length} essential files, version ${version}`);
}
