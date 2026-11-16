/* Built with the current app assets by scripts/build-pwa.mjs. */
const cachePrefix = 'parsiword-app-';
const cacheName = cachePrefix + '__CACHE_VERSION__';
const essentialFiles = __PRECACHE_FILES__;
const scope = new URL(self.registration.scope);
const scopedUrl = path => new URL(path, scope);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    try {
      // Bounded batches avoid overwhelming a phone on the first installation.
      for (let index = 0; index < essentialFiles.length; index += 12) {
        await Promise.all(essentialFiles.slice(index, index + 12).map(async path => {
          const url = scopedUrl(path);
          const response = await fetch(url, { cache: 'reload' });
          if (!response.ok) throw new Error(`Offline asset unavailable: ${path}`);
          await cache.put(url, response);
        }));
      }
    } catch (error) {
      await caches.delete(cacheName);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(cachePrefix) && name !== cacheName) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const path = url.pathname.slice(scope.pathname.length);
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(cacheName);
      const language = /^en(?:\/|$)/.test(path) ? 'en/index.html' : 'index.html';
      return await cache.match(scopedUrl(language)) ?? Response.error();
    }));
    return;
  }
  if (!/^(?:assets\/|fonts\/|tikz\/|xetex\/)/.test(path)
      && !['icon.png', 'pwa-icon-192.png', 'pwa-icon-512.png', 'font-catalogue.json', 'manifest.webmanifest', 'en/manifest.webmanifest'].includes(path)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    const saved = await cache.match(request, { ignoreSearch: true });
    if (saved && !['reload', 'no-cache'].includes(request.cache)) return saved;
    try {
      const response = await fetch(request);
      if (response.ok) event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
      return response;
    } catch (error) {
      if (saved) return saved;
      throw error;
    }
  })());
});
