// Generate the browser's static TTF catalogue without an API key or backend.
// Run with Node 24: node --use-env-proxy scripts/refresh-web-fonts.mjs
// Only public family names/weights are sent to Google's official CSS service.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const catalogue = JSON.parse(await readFile(new URL('../src/data/google-fonts.json', import.meta.url), 'utf8'));
const destination = new URL('../public/font-catalogue.json', import.meta.url);
const requestedWeights = font => [...new Set([400, 700].map(target => [...font.weights].sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0]))];
const faces = new Map();
const failures = [];
// Google applies one subset list to the whole request. Mixing unrelated lists
// can silently return Latin-only TTFs for an Arabic family. Batch only families
// with identical coverage, matching the native downloader's per-family query.
const groups = new Map();
for (const font of catalogue.families) {
  const key = [...(font.subsets || ['latin', ...(font.arabic ? ['arabic'] : [])])].sort().join(',');
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(font);
}
const batches = [...groups.values()].flatMap(fonts => Array.from({ length: Math.ceil(fonts.length / 10) }, (_, index) => fonts.slice(index * 10, index * 10 + 10)));
let completed = 0;

async function request(fonts) {
  const url = new URL('https://fonts.googleapis.com/css');
  url.searchParams.set('family', fonts.map(font => `${font.family}:${requestedWeights(font).join(',')}`).join('|'));
  url.searchParams.set('subset', [...new Set(fonts.flatMap(font => font.subsets || ['latin', ...(font.arabic ? ['arabic'] : [])]))].join(','));
  url.searchParams.set('display', 'swap');
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(url, {
        headers: { 'User-Agent': 'ParsiWord/0.4.7 (font download; TrueType)' },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok || response.status === 400) break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  if (!response?.ok) throw new Error(`Google CSS returned ${response?.status || 'no response'}`);
  const css = await response.text();
  for (const match of css.matchAll(/@font-face\s*\{([^}]+)\}/g)) {
    const block = match[1];
    const family = /font-family:\s*['"]([^'"]+)['"]/.exec(block)?.[1];
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    const url = /url\((https:\/\/fonts\.gstatic\.com\/s\/[^\s)]+)\)\s*format\(['"](?:truetype|opentype)['"]\)/.exec(block)?.[1];
    if (!family || !weight || !url || !/font-style:\s*normal/.test(block)) continue;
    faces.set(family, { ...faces.get(family), [weight]: url });
  }
}

function complete(font) {
  return requestedWeights(font).every(weight => faces.get(font.family)?.[weight]);
}

async function worker() {
  while (batches.length) {
    const fonts = batches.shift();
    try { await request(fonts); } catch { /* Isolate outdated families below. */ }
    for (const font of fonts.filter(font => !complete(font))) {
      try { await request([font]); } catch (error) {
        if (!faces.has(font.family)) failures.push(`${font.family}: ${error.message}`);
      }
      if (!faces.has(font.family)) {
        if (!failures.some(message => message.startsWith(`${font.family}:`))) failures.push(`${font.family}: no TTF response`);
      } else if (!complete(font)) console.warn(`${font.family}: official service supplies weights ${Object.keys(faces.get(font.family)).join(',')}; use the nearest available face`);
    }
    completed += fonts.length;
    if (completed % 100 === 0 || completed === catalogue.families.length) console.log(`TTF catalogue: ${completed}/${catalogue.families.length} families checked`);
  }
}

await Promise.all(Array.from({ length: 4 }, () => worker()));
if (failures.length) {
  console.error(failures.join('\n'));
  throw new Error(`${failures.length} families are incomplete; existing catalogue was preserved`);
}
const result = {
  updated: new Date().toISOString(),
  source: 'https://fonts.googleapis.com/css (non-browser TrueType response)',
  families: catalogue.families.map(font => ({ ...font, weights: Object.keys(faces.get(font.family)).map(Number).sort((a, b) => a - b), faces: faces.get(font.family) })),
};
await writeFile(destination, `${JSON.stringify(result)}\n`);
console.log(`Saved ${result.families.length} families to ${fileURLToPath(destination)}`);
