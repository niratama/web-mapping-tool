/**
 * sw.js - GridMap Studio Service Worker (PWA Offline Support)
 * Zero-Dependency, Pure Web Standards
 */

const CACHE_NAME = 'gridmap-studio-v1.2.0';

const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/state.js',
  'js/grid.js',
  'js/walls.js',
  'js/objects.js',
  'js/color.js',
  'js/renderer.js',
  'js/palette.js',
  'js/hotbar.js',
  'js/shortcuts.js',
  'js/export.js',
  'js/settings.js',
  'js/gdrive.js',
  'js/canvas.js',
  'js/app.js',
  'assets/icon.svg',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/textures/wood_floor.jpg',
  'assets/textures/stone_pavement.jpg',
  'assets/textures/marble_tile.jpg',
  'assets/textures/dungeon_flagstone.jpg',
  'assets/textures/tatami_mat.jpg',
  'assets/textures/persian_rug.jpg',
  'assets/textures/ornate_chest.jpg',
  'assets/textures/stone_altar.jpg',
  'assets/textures/magic_circle.jpg',
  'assets/textures/magic_circle_alpha.png',
  'assets/textures/round_rug_alpha.png'
];

// Install: Cache all core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up older cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate for local assets, bypass for external Google APIs
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Bypass non-GET and external third-party API requests (Google Drive, GIS SDK)
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // If network fails and there is no cache, return fallback if needed
        return cachedResponse;
      });

      // Return cached response immediately if available, otherwise wait for network
      return cachedResponse || fetchPromise;
    })
  );
});
