const CACHE_NAME = "eaststone-stock-control-pwa-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/es-stock-icon-192.png",
  "/icons/es-stock-icon-512.png",
  "/icons/es-stock-icon-maskable-512.png",
  "/icons/es-stock-icon-monochrome-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // All live application and API data remains network-only. The service worker
  // only supplies the controlled offline notice when a page navigation cannot
  // reach the central server.
  if (request.mode === "navigate") {
    const networkOnlyRequest = new Request(request, { cache: "no-store" });
    event.respondWith(
      fetch(networkOnlyRequest).catch(async () => {
        const cachedOfflinePage = await caches.match(OFFLINE_URL);
        return cachedOfflinePage || Response.error();
      }),
    );
  }
});
