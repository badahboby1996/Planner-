const CACHE = 'hustle-v8-training-cycle-2026-09-06';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/food-hero.webp',
  './assets/exercises-sunday.webp',
  './assets/exercises-monday.webp',
  './assets/exercises-wednesday.webp',
  './assets/exercises-friday.webp',
  './bent-knee-hollow-hold.webp',
  './bird-dog.webp',
  './cable-triceps-pushdown.webp',
  './calf-raise.webp',
  './chest-supported-row.webp',
  './dead-bug.webp',
  './dumbbell-bench-press.webp',
  './dumbbell-biceps-curl.webp',
  './dumbbell-lateral-raise.webp',
  './dumbbell-romanian-deadlift.webp',
  './face-pull.webp',
  './goblet-squat.webp',
  './heel-taps.webp',
  './hip-thrust.webp',
  './incline-dumbbell-press.webp',
  './lat-pulldown.webp',
  './leg-curl-machine.webp',
  './leg-press.webp',
  './low-cable-biceps-curl.webp',
  './mcgill-curl-up.webp',
  './pec-deck-fly.webp',
  './plank-shoulder-tap.webp',
  './plank.webp',
  './reverse-crunch.webp',
  './reverse-dumbbell-lunge.webp',
  './rope-triceps-extension.webp',
  './seated-cable-row.webp',
  './seated-shoulder-press.webp',
  './side-plank.webp'
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
  const isPage = request.mode === 'navigate' || new URL(request.url).pathname.endsWith('/index.html');

  if (isPage) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
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
