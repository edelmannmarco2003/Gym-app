/* Gym Tracker – offline support.
 *
 * Every release is one complete, separate cache. A new version is downloaded in full in the
 * background and only then replaces the old one, so the app never runs a mix of old and new files.
 *
 * VERSION must change whenever one of the files below changes: run `node tests/sw-version.test.js --write`
 * (the test suite fails if it is out of date).
 */
const VERSION = '66ccb545494b';
const PREFIX = 'gym-tracker-';
const CACHE = PREFIX + VERSION;
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
  // 'reload' skips the browser's HTTP cache, so the new cache really holds the new files.
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
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
  // caches.match (unlike caches.open) never re-creates a cache that a newer version just removed.
  event.respondWith(
    caches.match(request, { cacheName: CACHE, ignoreSearch: true }).then((cached) => cached || fetch(request))
  );
});
