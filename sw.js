/* Жарава v2 · Service Worker — първо мрежа (винаги пресни файлове), кеш само офлайн */
const CACHE = "zharava-v20";
const ASSETS = [
  "./", "./index.html", "./style.css", "./app.js",
  "./data-2026-07.js", "./bg-embers.webp",
  "./firebase-config.js", "./firebase-sync.js",
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
/* Network-first: винаги пробваме мрежата (с revalidate, за да прескочим HTTP кеша),
   пазим свежо копие и падаме на кеша само когато няма мрежа. Така новите версии
   се виждат веднага след публикуване, без да зависим от стар кеш. */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const sameOrigin = new URL(e.request.url).origin === self.location.origin;
  // Firebase (auth/firestore) и другите външни заявки минават директно —
  // кешираме само собствените файлове, шрифтовете и Firebase SDK скриптовете
  const cacheable = sameOrigin || e.request.url.includes("fonts.") || e.request.url.includes("gstatic.com/firebasejs");
  if (!cacheable) return;
  const req = sameOrigin ? new Request(e.request, { cache: "no-cache" }) : e.request;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
