// Laluan service worker: the app shell works offline, and the last Today and Pathway data can be
// read without a connection. Hand-written (no build plugin) so every rule is visible here.
//
// - Pages: network first; offline, the cached index.html (the app keeps its state in ?view=).
// - /assets/* (hashed file names), icons, fonts: cache first, kept as they are fetched.
// - API reads behind Today and Pathway: network first; offline, the last copy. Nothing else from
//   the API is cached, and nothing is ever sent from here. "Delete my profile" and logging out
//   tell this worker to drop the data cache.
const SHELL = "laluan-shell-v1";
const DATA = "laluan-data-v1";
const SHELL_FILES = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg", "/icons/icon-192.png"];
const OFFLINE_API = [
  /\/api\/profiles\/[^/]+$/,
  /\/api\/profiles\/[^/]+\/(matches|journey|pathway|progress|tree)$/,
  /\/api\/roles\/[^/]+$/,
  /\/api\/health$/,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data === "clear-data") event.waitUntil(caches.delete(DATA));
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(fallbackUrl ?? request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackUrl ?? request, { ignoreVary: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  // Runtime settings (written by the Docker image at start-up): fresh when online, last copy offline.
  if (url.origin === self.location.origin && url.pathname === "/config.js") {
    event.respondWith(networkFirst(request, SHELL));
    return;
  }
  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, SHELL, "/index.html"));
    return;
  }
  if (url.pathname.startsWith("/api/")) {
    // The data cache is keyed by URL only (not the login header): it holds this device's own copy.
    if (OFFLINE_API.some((re) => re.test(url.pathname))) {
      const key = url.origin + url.pathname + url.search;
      event.respondWith(networkFirst(request, DATA, key));
    }
    return;
  }
  if (url.origin === self.location.origin && /^\/(assets|icons|images)\/|\.(woff2?|svg|png)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});
