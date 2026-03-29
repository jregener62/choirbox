const CACHE_NAME = 'choirbox-shell-v1'

// App-Shell: nur die statischen Assets cachen
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
]

// Install: App-Shell vorladen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
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

// Fetch: Network-first für alles, Fallback auf Cache für App-Shell
self.addEventListener('fetch', (event) => {
  const { request } = event

  // API-Calls und Audio-Streams nie cachen
  if (request.url.includes('/api/')) return

  // Für Navigation (HTML): Network-first mit Cache-Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    )
    return
  }

  // Für statische Assets: Stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
        }
        return response
      })
      return cached || fetchPromise
    })
  )
})
