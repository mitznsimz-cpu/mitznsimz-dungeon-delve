/* Mitz & Simz: Dungeon Delve — offline cache.
   v6.1.11: network first, the cache only when there is no network. Cache-first
   served the old game on a refresh after every release (and refilled from the
   browser's HTTP cache, so even a new CACHE could hold old files): it took
   several refreshes to see a fix. Now one does, and offline still works.
   Bump CACHE on every release. */
const CACHE = 'msdd-v7.3.0';
const ASSETS = [
  './',
  './index.html',
  './msdd_assets.js',          // wall textures; without it the walls are drawn as masonry
  './msdd_materials.js',       // v6.0: the 3D view's stone, wood, water and zones
  './msdd_view3d.js',          // v6.0: the 3D view; without it the view is drawn in 2D
  './msdd_workshop.js',        // v7.0: the Workshop, the floor editor
  './motion.js',               // the shared motion module; without it fights are still
  './sound.js',                // the shared sound module; without it fights are silent
  './msdd.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  // 'reload' goes past the browser's HTTP cache, so a new CACHE holds new files
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {       // fresh when online, revalidated
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit ||
      (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
