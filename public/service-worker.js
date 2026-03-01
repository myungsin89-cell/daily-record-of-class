const CACHE_NAME = 'class-diary-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/src/main.jsx',
    '/src/index.css'
];

// Install event - cache resources but don't auto-activate
// New version will wait in 'waiting' state until user approves
self.addEventListener('install', (event) => {
    console.log('[SW] Installing new service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Opened cache:', CACHE_NAME);
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('[SW] Installation complete. Waiting for activation approval...');
            })
    );
    // DO NOT call self.skipWaiting() here
    // This allows the new SW to stay in 'waiting' state
});

// Message event - listen for activation command from client
self.addEventListener('message', (event) => {
    console.log('[SW] Received message:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] Activation approved by user. Activating new version...');
        self.skipWaiting();
    }
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating new service worker...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
        .then(() => {
            console.log('[SW] Activation complete. Taking control of all clients...');
        })
    );
    // Take control of all pages immediately
    return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip caching for API requests (Gemini API)
    if (event.request.url.includes('generativelanguage.googleapis.com')) {
        return event.respondWith(fetch(event.request));
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

                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });

                    return response;
                })
                    .catch(() => {
                        // Offline fallback
                        return new Response(
                            '<html><body><h1>오프라인</h1><p>인터넷 연결을 확인해주세요.</p></body></html>',
                            { headers: { 'Content-Type': 'text/html' } }
                        );
                    });
            })
    );
});
