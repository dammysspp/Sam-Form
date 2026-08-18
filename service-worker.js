const CACHE_NAME = 'formforge-v1';
const ASSETS = [
  './',
  './index.html',
  './builder.html',
  './responder.html',
  './results.html',
  './css/main.css',
  './css/builder.css',
  './css/responder.css',
  './css/results.css',
  './css/responsive.css',
  './js/storage.js',
  './js/utils.js',
  './js/questions.js',
  './js/importer.js',
  './js/exporter.js',
  './js/scoring.js',
  './js/timer.js',
  './js/builder.js',
  './js/responder.js',
  './js/results.js',
  './js/app.js',
  './data/templates.json',
  './data/sample_questions.json',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => console.log('Cache pre-fetch warning:', err));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Stale-while-revalidate for local assets, network fallback
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);
      return cachedResponse || fetchPromise;
    })
  );
});
