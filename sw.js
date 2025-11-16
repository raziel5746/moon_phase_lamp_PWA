// Service Worker for Moon Lamp PWA
const CACHE_NAME = 'moon-lamp-v3';
const urlsToCache = [
  '/moon_phase_lamp_PWA/',
  '/moon_phase_lamp_PWA/index.html',
  '/moon_phase_lamp_PWA/styles.css',
  '/moon_phase_lamp_PWA/app.js',
  '/moon_phase_lamp_PWA/manifest.json',
  '/moon_phase_lamp_PWA/icon-192.png',
  '/moon_phase_lamp_PWA/icon-512.png'
];

// Install event - cache files
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((error) => {
        console.error('Cache failed:', error);
      })
  );

  // Allow this SW to move to the "installed" state immediately
  self.skipWaiting();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
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
      // Ensure the new SW takes control of already-open clients
      return self.clients.claim();
    })
  );
});

// Listen for messages from the client to trigger skipWaiting explicitly
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    console.log('Service Worker: SKIP_WAITING received');
    self.skipWaiting();
  }
});
