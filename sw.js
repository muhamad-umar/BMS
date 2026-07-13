const CACHE_NAME = 'smartstock-v1';

// Install event - caches initial app shell if needed, but we keep it lightweight
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

// Activate event - cleans up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// Fetch event - network first strategy to ensure data is always fresh
self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // Skip Supabase API calls from service worker caching
    if (event.request.url.includes('supabase.co')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // If response is valid, cache a copy
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // On network failure, try to serve from cache
                return caches.match(event.request);
            })
    );
});
