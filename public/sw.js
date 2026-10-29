const CACHE_NAME = 'hiragana-renshu-v1';
const PRECACHE_URLS = [
  '/', '/index.html', '/style.css', '/app.js', '/store.js', '/kana.js', '/render.js', '/sheets.js',
  '/data/strokes.js', '/manifest.webmanifest', '/icons/hiragana.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 静的資産は stale-while-revalidate。オフラインでもプリントを作れるようにする。
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      const network = fetch(event.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
