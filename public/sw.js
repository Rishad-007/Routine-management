const CACHE = "school-routine-v2";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
  );
  self.clients.claim();
});

const isStatic = (url) =>
  url.pathname.startsWith("/_next/static") ||
  /\.(png|svg|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|css|js)$/i.test(url.pathname);

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // 1) Immutable, versioned assets: cache-first, refresh in the background.
  //    Repeat visits never re-download the JS/CSS bundles.
  if (isStatic(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // 2) Freshness-critical paths (admin tools, API, PDFs): network-first.
  //    Admin data is never served stale — offline only falls back to cache.
  if (request.mode !== "navigate" || url.pathname.startsWith("/admin")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;
            if (request.mode === "navigate") return caches.match("/");
            return undefined;
          })
        )
    );
    return;
  }

  // 3) Public page navigations: stale-while-revalidate.
  //    Paint the cached page instantly, then refresh it in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => undefined);
      if (cached) {
        event.waitUntil(refresh.then(() => {}));
        return cached;
      }
      return refresh.then((r) => r || caches.match("/"));
    })
  );
});