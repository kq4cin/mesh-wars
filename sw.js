// MESH WARS service worker: caches the game so it starts with no internet connection.
const CACHE = 'meshwars-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first so updates arrive when online; fall back to the cache when offline.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
        .then(hit => hit || Response.error()))
  );
});

function outboxCount() {
  return new Promise(res => {
    let r;
    try { r = indexedDB.open('meshwars-db'); } catch (x) { return res(0); }
    r.onupgradeneeded = () => r.transaction.abort();
    r.onerror = () => res(0);
    r.onsuccess = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('outbox')) { d.close(); return res(0); }
      const c = d.transaction('outbox', 'readonly').objectStore('outbox').count();
      c.onsuccess = () => { res(c.result); d.close(); };
      c.onerror = () => { res(0); d.close(); };
    };
  });
}

// Wake the game to flush queued mesh packets when connectivity returns.
self.addEventListener('sync', e => {
  if (e.tag !== 'mesh-outbox') return;
  e.waitUntil(outboxCount().then(n => self.clients.matchAll({ includeUncontrolled: true })
    .then(cs => cs.forEach(c => c.postMessage({ type: 'flush-outbox', pending: n })))));
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'outbox-count') {
    outboxCount().then(n => e.source && e.source.postMessage({ type: 'outbox-count', pending: n }));
  }
});
