// Minimal service worker: makes the app installable and the shell load instantly.
// API calls are never cached. Works at the domain root or in a subfolder (e.g. /irdevice/):
// all paths are derived from the scope the worker was registered with.
const CACHE = 'irremote-shell-v2';
const SCOPE = new URL(self.registration.scope).pathname; // '/' or '/irdevice/'
const API = SCOPE + 'api/';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([SCOPE])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith(API)) return;

  if (req.mode === 'navigate') {
    // Network first, fall back to the cached shell when offline
    e.respondWith(fetch(req).catch(() => caches.match(SCOPE)));
    return;
  }
  // Static assets (hashed filenames): cache first
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
    )
  );
});
