/* Жарава v2 · Service Worker — мигновен старт от кеша, тихо обновяване
   (stale-while-revalidate). Приложението се показва веднага от кеша,
   а свежата версия се тегли във фонов режим и се вижда при следващото
   отваряне. Офлайн работи изцяло от кеша, вкл. шрифтовете. */
const CACHE = "zharava-v19";
const ASSETS = [
  "./", "./index.html", "./style.css", "./app.js",
  "./data-2026-07.js", "./bg-embers.webp",
  "./icon.svg", "./manifest.webmanifest",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = !sameOrigin && url.hostname.startsWith("fonts.");
  if (!sameOrigin && !isFont) return; // всичко друго — направо към мрежата

  // Ключът за кеша е без ?v=… — така прекешираните файлове важат и за
  // версионираните URL-и, а свежестта идва от фоновото обновяване.
  const key = sameOrigin ? url.origin + url.pathname : e.request;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);

    // Шрифтовете са практически неизменни — кеш-first, без ревалидация.
    if (isFont && cached) return cached;

    const update = fetch(sameOrigin ? new Request(e.request, { cache: "no-cache" }) : e.request)
      .then((res) => {
        // status 0 (opaque) са отговорите от чужд домейн (шрифтовете) — и те се кешират
        if (res && (res.status === 200 || res.type === "opaque")) {
          const copy = res.clone();
          cache.put(key, copy);
        }
        return res;
      })
      .catch(() => null);

    if (cached) {
      e.waitUntil(update); // обновяването довършва във фонов режим
      return cached;
    }
    const fresh = await update;
    if (fresh) return fresh;
    return Response.error();
  })());
});
