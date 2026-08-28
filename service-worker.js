const CACHE_NAME = 'formforge-v2';
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
  './js/icons.js',
  './js/storage.js',
  './js/supabase.js',
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
      return cache.addAll(ASSETS).catch((err) => console.log('Cache pre-fetch notice:', err));
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
  // Only handle GET requests
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // NEVER intercept Supabase, Render, EmailJS, Telegram, or external APIs
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('render.com') ||
    url.hostname.includes('emailjs.com') ||
    url.hostname.includes('api.telegram.org') ||
    url.hostname.includes('qrserver.com')
  ) {
    return;
  }

  // Same-origin static asset caching strategy: Cache-first with Network Fallback
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in background to revalidate cache
        fetch(e.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});
