// The local server supplies SHELL_ID and SHELL_URLS from the app's current files.
const prefix = 'cockpit-shell-';
const shellCache = prefix + SHELL_ID;
const shellPaths = new Set(SHELL_URLS);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(shellCache);
    await cache.addAll(SHELL_URLS.map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== shellCache).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  const key = url.pathname === '/index.html' ? '/' : url.pathname;
  if (!shellPaths.has(key)) return;
  event.respondWith((async () => {
    const cache = await caches.open(shellCache);
    return await cache.match(key) || fetch(request);
  })());
});
