/* Shalosh offline shell. The media never comes near here — it lives in IndexedDB. */
const CACHE = "shalosh-v3";
const SHELL = ["./", "index.html", "app.css", "app.js", "manifest.webmanifest",
               "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;
  // the page and its files: serve from cache, refresh in the background
  event.respondWith(caches.match(request).then(hit => {
    const live = fetch(request).then(res => {
      if (res && res.status === 200 && new URL(request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
      }
      return res;
    }).catch(() => hit);
    return hit || live;
  }));
});
