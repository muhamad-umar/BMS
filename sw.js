const CACHE_NAME = 'smartstock-v5';

// Only cache the absolute bare minimum guarantees for install.
// All other CSS/JS assets will be dynamically cached via the fetch listener.
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './icon.svg'
];

// Install event - caches main static assets safely
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Opened cache and caching base assets');
            // Use catch to prevent a single 404 from crashing the entire SW install
            return Promise.all(
                ASSETS_TO_CACHE.map(url => {
                    return cache.add(url).catch(err => console.error('Failed to cache:', url, err));
                })
            );
        })
    );
    self.skipWaiting();
});

// Activate event - deletes old cache versions (cache-busting)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    return self.clients.claim();
});

// Fetch event - network first fallback to cache, ignores API calls
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    // Ignore external APIs (Supabase)
    if (event.request.url.includes('supabase.co')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});
