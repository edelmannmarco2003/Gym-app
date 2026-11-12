/* Gym Tracker – offline support. Cached files are served immediately and refreshed in the background. */
const PREFIX = 'gym-tracker-';
const CACHE = PREFIX + 'v1';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/store.js',
  'js/charts.js',
  'js/app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  // Only remove this app's old caches: other apps may share the origin (e.g. on GitHub Pages).
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    const refresh = fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    });
    if (cached) {
      event.waitUntil(refresh.catch(() => {}));
      return cached;
    }
    return refresh;
  })());
});
