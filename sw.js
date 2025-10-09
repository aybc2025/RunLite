/**
 * sw.js - RunLite Service Worker
 * מטפל בקאשינג ועבודה אופליין
 */

const CACHE_VERSION = 'runlite-v1.0.0';
const CACHE_NAME = CACHE_VERSION;

// קבצים לקאש (הכל מה שצריך לעבודה אופליין)
const STATIC_CACHE_URLS = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './js/storage.js',
    './js/compute.js',
    './js/gps.js',
    './js/map.js',
    './js/gpx.js',
    './manifest.json',
    // Leaflet מ-CDN
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png'
];

/**
 * Install Event - קאש כל הקבצים הסטטיים
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker...', CACHE_VERSION);
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                console.log('[SW] Static assets cached successfully');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('[SW] Failed to cache static assets:', error);
            })
    );
});

/**
 * Activate Event - ניקוי קאשים ישנים
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker...', CACHE_VERSION);
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        // מחיקת גרסאות ישנות
                        if (cacheName !== CACHE_NAME) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Service Worker activated');
                return self.clients.claim();
            })
    );
});

/**
 * Fetch Event - טיפול בבקשות
 * אסטרטגיה: Cache First עם fallback ל-Network
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // דילוג על בקשות שאינן HTTP/HTTPS
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // אסטרטגיה שונה למפות
    if (url.hostname.includes('tile.openstreetmap.org')) {
        event.respondWith(handleMapTiles(request));
        return;
    }

    // אסטרטגיה כללית: Cache First
    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    // נמצא בקאש - החזר אותו
                    return cachedResponse;
                }

                // לא בקאש - נסה להוריד מהרשת
                return fetch(request)
                    .then(networkResponse => {
                        // אם התשובה תקינה, שמור בקאש
                        if (networkResponse && networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();
                            
                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(request, responseClone);
                                });
                        }
                        
                        return networkResponse;
                    })
                    .catch(error => {
                        console.error('[SW] Fetch failed:', error);
                        
                        // אם זו בקשה לדף HTML, החזר את index.html מהקאש
                        if (request.headers.get('accept').includes('text/html')) {
                            return caches.match('./index.html');
                        }
                        
                        // אחרת, החזר שגיאה
                        return new Response('Offline - resource not available', {
                            status: 503,
                            statusText: 'Service Unavailable',
                            headers: new Headers({
                                'Content-Type': 'text/plain'
                            })
                        });
                    });
            })
    );
});

/**
 * טיפול מיוחד ב-tiles של מפות
 * אסטרטגיה: Cache First, אבל אל תחסום אם אין אינטרנט
 */
function handleMapTiles(request) {
    return caches.match(request)
        .then(cachedResponse => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(request)
                .then(networkResponse => {
                    // שמירת tile בקאש
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(request, responseClone);
                            });
                    }
                    
                    return networkResponse;
                })
                .catch(error => {
                    console.log('[SW] Map tile not available offline:', request.url);
                    
                    // החזר placeholder tile ריק במקום שגיאה
                    return new Response('', {
                        status: 200,
                        statusText: 'OK',
                        headers: new Headers({
                            'Content-Type': 'image/png'
                        })
                    });
                });
        });
}

/**
 * Message Event - טיפול בהודעות מהאפליקציה
 */
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys()
                .then(cacheNames => {
                    return Promise.all(
                        cacheNames.map(cacheName => caches.delete(cacheName))
                    );
                })
                .then(() => {
                    console.log('[SW] All caches cleared');
                    return self.clients.matchAll();
                })
                .then(clients => {
                    clients.forEach(client => {
                        client.postMessage({
                            type: 'CACHE_CLEARED'
                        });
                    });
                })
        );
    }
});

/**
 * Sync Event - סנכרון ברקע (לעתיד)
 */
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync triggered:', event.tag);
    
    if (event.tag === 'sync-runs') {
        // TODO: סנכרון ריצות בעתיד
    }
});

console.log('[SW] Service Worker loaded', CACHE_VERSION);
