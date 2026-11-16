// Offline support: serve cached files, refresh them in the background.
const CACHE = 'ludo-mood-v2';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.json',
  'js/main.js', 'js/rules.js', 'js/audio.js', 'js/scene3d.js',
  'vendor/three.module.min.js', 'vendor/cannon-es.js', 'vendor/RoundedBoxGeometry.js', 'vendor/RoomEnvironment.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first so new pushes show up straight away; cache when offline.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
