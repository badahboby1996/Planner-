const CACHE = 'hustle-v8-story-2026-08-29';
const CORE = [
  './',
  './index.html',
  './story.html',
  './vendor/three.min.js',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/food-hero.webp',
  './assets/exercises-sunday.webp',
  './assets/exercises-monday.webp',
  './assets/exercises-wednesday.webp',
  './assets/exercises-friday.webp'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const request = event.request;
  const path = new URL(request.url).pathname;
  const isPage = request.mode === 'navigate' || path.endsWith('.html');
  // Всяка страница се кешира под собствения си адрес. Само коренът и index.html
  // обновяват кеша на приложението — иначе story.html би заменил index.html.
  const cacheKey = path.endsWith('/story.html') ? './story.html' : './index.html';

  if (isPage) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(cacheKey, copy));
          return response;
        })
        .catch(() => caches.match(cacheKey).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
      return response;
    }))
  );
});
