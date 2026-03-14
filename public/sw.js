// Service worker for PWA — offline fallback + push notifications

const CACHE_NAME = 'claudeck-v1';
const OFFLINE_URL = '/offline.html';

// Assets to pre-cache for offline support
const PRECACHE_URLS = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: pre-cache offline page ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first, offline fallback for navigations ──
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Navigation requests (HTML pages) — show offline page on failure
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Static assets (icons) — cache-first
  if (event.request.url.includes('/icons/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // Everything else — network only (localhost app)
  event.respondWith(fetch(event.request));
});

// ── Web Push — show notification only when no client is focused ──
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      const anyFocused = windowClients.some((c) => c.focused);
      if (anyFocused) return; // skip — user is already looking at the app

      // Tell any open (unfocused) client to play a sound
      windowClients.forEach((c) => c.postMessage({ type: 'play-notification-sound' }));

      return self.registration.showNotification(data.title || 'Claudeck', {
        body: data.body || '',
        tag: data.tag || 'default',
        icon: '/icons/icon-192.png',
        silent: true, // suppress OS sound — client plays its own
      });
    })
  );
});

// ── Focus or open the app when a notification is clicked ──
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});
