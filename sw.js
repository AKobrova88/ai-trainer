// Camera code is refreshed separately from the large model files already on the device.
const ASSETS = 'aitrainer-20261105-v271';
const CAMERA = 'aitrainer-camera-278';
const scope = new URL(self.registration.scope);
const entry = new URL('index.html', scope).href;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CAMERA).then(cache => cache.add(new Request(entry, {cache: 'reload'})))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith('aitrainer-camera-') && key !== CAMERA).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

function save(cache, key, response) {
  if (!response?.ok) return;
  const copy = response.clone();
  return cache.then(storage => storage.put(key, copy));
}

function networkFirst(event, key) {
  const cache = caches.open(CAMERA);
  const fresh = fetch(event.request, {cache: 'no-cache'});
  event.waitUntil(fresh.then(response => save(cache, key, response)).catch(() => {}));
  // A script can fall back only to the exact URL, including its release query.
  event.respondWith(fresh.catch(async error => (await (await cache).match(key)) || Promise.reject(error)));
}

self.addEventListener('fetch', event => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const path = url.pathname.slice(scope.pathname.length);
  if (path === '' || path === 'index.html') return networkFirst(event, entry);
  if (path.startsWith('cam/') || path.startsWith('shared/') || path === 'app/js/data/catalog.js') return networkFirst(event, req);
  if (path.startsWith('app/') || path === 'app' || path.endsWith('.mp4') || req.mode === 'navigate') return;
  const cache = caches.open(ASSETS);
  const hit = cache.then(storage => storage.match(req));
  const fresh = hit.then(cached => cached ? null : fetch(req));
  event.waitUntil(fresh.then(response => save(cache, req, response)).catch(() => {}));
  event.respondWith(hit.then(cached => cached || fresh));
});
