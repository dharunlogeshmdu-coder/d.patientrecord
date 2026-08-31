// Minimal service worker — required by Chrome/Android to allow "Install App"
// Add features (offline caching, etc.) later if needed.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

// Pass-through fetch handler (required to be considered a valid PWA)
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
