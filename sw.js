const CACHE_NAME = 'nyms-v2';
const ASSETS = [
  'index.html',
  'app.html',
  'styles.css',
  'firebase-config.js',
  'auth.js',
  'pwa-install.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first: önce internetten taze veriyi dener, sadece
// bağlantı yoksa önbelleğe döner. Böylece kod güncellemeleri
// artık takılı kalmıyor.
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
