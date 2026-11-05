// ИИ Тренер: offline cache. Page and the camera's own code (cam/) = network first, libraries and models = cache first.
// Since 2.7 the camera page is split into files: its code must never be served stale next to a fresh page.
const CACHE = 'aitrainer-20261105-v271';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('aitrainer-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const networkFirst = (req, key) => fetch(req).then(r => {
  if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(key || req, copy)); }
  return r;
}).catch(() => caches.match(key || req, {ignoreSearch: !key}));
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.includes('/app/')) return;   // the web app next door keeps its own files
  if (url.pathname.endsWith('.mp4')) return;   // example videos stream straight from the network (range requests)
  if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')) {
    e.respondWith(networkFirst(req, 'index.html'));
    return;
  }
  if (url.pathname.includes('/cam/') || url.pathname.endsWith('/config.js')) { e.respondWith(networkFirst(req)); return; }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  })));
});
