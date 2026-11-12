/* Mitz & Simz: Dungeon Delve — offline cache.
   Cache-first: the game is a single file with no network dependencies, so once
   it is cached it runs with the radio off. Bump CACHE on every release. */
const CACHE = 'msdd-v6.1.3';
const ASSETS = [
  './',
  './index.html',
  './msdd_assets.js',          // wall textures; without it the walls are drawn as masonry
  './msdd_materials.js',       // v6.0: the 3D view's stone, wood, water and zones
  './msdd_view3d.js',          // v6.0: the 3D view; without it the view is drawn in 2D
  './motion.js',               // the shared motion module; without it fights are still
  './sound.js',                // the shared sound module; without it fights are silent
  './msdd.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
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
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res && res.status === 200 && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
