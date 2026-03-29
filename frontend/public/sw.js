const CACHE_NAME = 'choirbox-v2'

// Install: sofort aktivieren, nichts vorladen
self.addEventListener('install', () => {
  self.skipWaiting()
})

// Activate: alte Caches aufräumen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: Network-first, Cache nur als Offline-Fallback
self.addEventListener('fetch', (event) => {
  const { request } = event

  // API-Calls und Audio-Streams nie cachen
  if (request.url.includes('/api/')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Erfolgreiche GET-Responses für Offline cachen
        if (response.ok && request.method === 'GET') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      .catch(() => {
        // Offline: aus Cache liefern, für Navigation index.html
        if (request.mode === 'navigate') {
          return caches.match('/index.html')
        }
        return caches.match(request)
      })
  )
})
