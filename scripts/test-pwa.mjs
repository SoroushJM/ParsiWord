import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (!pathname.startsWith('/ParsiWord/')) { response.writeHead(404).end(); return; }
  const name = pathname.slice('/ParsiWord/'.length) || 'index.html';
  const file = resolve(root, name.endsWith('/') ? `${name}index.html` : name);
  if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    const type = types[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const base = `http://127.0.0.1:${address.port}/ParsiWord/`;
let browser;
try {
  browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome' } : {});
  const context = await browser.newContext({ serviceWorkers: 'allow' });
  const page = await context.newPage();
  await page.goto(base);
  await expect(page.locator('.markdown-editor')).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 30000 });
  const installed = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const manifest = await (await fetch(document.querySelector('link[rel="manifest"]').href)).json();
    const cachesReady = (await caches.keys()).some(name => name.startsWith('parsiword-app-'));
    return { script: registration.active?.scriptURL, manifest, cachesReady };
  });
  assert.equal(installed.script, `${base}sw.js`);
  assert.equal(installed.manifest.start_url, './');
  assert.ok(installed.cachesReady);
  const optional = `${base}tikz/manifest.json`;
  await page.evaluate(url => fetch(url), optional);
  await expect.poll(() => page.evaluate(async url => {
    const cache = await caches.open((await caches.keys()).find(name => name.startsWith('parsiword-app-')));
    return Boolean(await cache.match(url));
  }, optional)).toBe(true);
  await page.locator('.markdown-editor').fill('# OFFLINE_DRAFT_PERSISTS');
  await page.waitForFunction(() => localStorage.getItem('parsiword-draft-v1')?.includes('OFFLINE_DRAFT_PERSISTS'));
  await context.setOffline(true);
  assert.equal(await page.evaluate(async url => (await fetch(url)).ok, optional), true);
  await page.reload();
  await expect(page.locator('.markdown-editor')).toHaveValue('# OFFLINE_DRAFT_PERSISTS');
  await page.goto(`${base}en/`);
  await expect(page.locator('.markdown-editor')).toHaveValue('# OFFLINE_DRAFT_PERSISTS');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  const english = await page.evaluate(async () => (await (await fetch(document.querySelector('link[rel="manifest"]').href)).json()).lang);
  assert.equal(english, 'en');
  console.log('PWA installed under /ParsiWord/; Persian and English reload offline with the saved draft.');
  await context.close();
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
