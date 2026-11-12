// Retire the old GitHub camera cache, keeping localStorage and IndexedDB data intact.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('aitrainer-')).map(k=>caches.delete(k)))).then(()=>self.registration.unregister()).then(()=>self.clients.claim())));
