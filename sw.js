// Service Worker for Moon Lamp PWA
const CACHE_NAME = 'moon-lamp-v__VERSION__';
// Detect base path from SW location (works for both localhost and GitHub Pages)
const swPath = self.location.pathname;
const BASE_PATH = swPath.substring(0, swPath.lastIndexOf('/') + 1);

const filesToCache = [
  '',
  'index.html',
  'manifest.json',
  'version.json',
  'icon-192.png',
  'icon-512.png',
  'suncalc.js',
  'iro.min.js',
  // CSS modules
  'css/base.css',
  'css/components.css',
  'css/tabs.css',
  'css/led-ring.css',
  'css/presets.css',
  'css/motor.css',
  'css/automations.css',
  'css/responsive.css',
  'css/modal.css',
  // JS modules
  'js/app.js',
  'js/constants.js',
  'js/utils.js',
  'js/bluetooth.js',
  'js/led-controller.js',
  'js/motor-controller.js',
  'js/presets.js',
  'js/automations.js',
  'js/ui.js',
  'js/modal.js',
];

// Build full URLs based on detected base path
const urlsToCache = filesToCache.map(file => BASE_PATH + file);

// Install event - cache files
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...', { CACHE_NAME, BASE_PATH, urlsToCache });
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache:', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Cache failed:', error);
      })
  );
  // Don't call skipWaiting() here - let the user decide when to update
});

// Files that should never be cached (always fetch fresh)
const neverCache = [
  'version.json',
  'sw.js'
];

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Always fetch these files fresh (never serve from cache)
  if (neverCache.some(file => url.pathname.endsWith(file))) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Old caches deleted, claiming clients...');
      return self.clients.claim();
    }).then(() => {
      // Notify all clients that activation is complete
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'ACTIVATION_COMPLETE' });
        });
      });
    })
  );
});

// Listen for messages from the client to trigger skipWaiting explicitly
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    console.log('Service Worker: SKIP_WAITING received');
    self.skipWaiting();
  }
});
