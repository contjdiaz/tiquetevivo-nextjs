/**
 * TiqueteVivo Service Worker (Next.js)
 * PWA app-shell caching. Network-first for API, cache-first for app routes.
 */
const CACHE_NAME = "tiquetevivo-next-v1";
const APP_ROUTES = [
  "/",
  "/admin",
  "/panel",
  "/tiquete",
  "/registro",
  "/buscar",
  "/pagar",
  "/entrega",
  "/aprobar"
];
const STATIC_ASSETS = [
  "/manifest.json",
  "/favicon.svg",
  "/icon-192.svg",
  "/icon-512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled([...APP_ROUTES, ...STATIC_ASSETS].map((u) => cache.add(u).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;

  // API: network-first, respond 503 offline
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: "Offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      }))
    );
    return;
  }

  // External resources (fonts/CDN): network-first with cache fallback
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell routes: network-first, fall back to cached HTML
  if (APP_ROUTES.some((route) => url.pathname === route)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Other same-origin assets: cache-first with network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});