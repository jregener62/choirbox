const CACHE_NAME = 'choirbox-v2'
const SHARE_CACHE = 'share-target-files'
const ACCEPTED_EXT = /\.(mp3|m4a|ogg|opus|webm|wav|mid|midi|pdf|txt)$/i

// Install: sofort aktivieren, nichts vorladen
self.addEventListener('install', () => {
  self.skipWaiting()
})

// Activate: alte Caches aufräumen (Share-Cache erhalten)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== SHARE_CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: Network-first, Cache nur als Offline-Fallback
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Share Target: POST abfangen, Dateien in Cache speichern, Redirect
  if (request.method === 'POST' && new URL(request.url).pathname === '/share-target') {
    event.respondWith(
      (async () => {
        const formData = await request.formData()
        const allFiles = formData.getAll('media')
        const files = allFiles.filter((f) => f.name && ACCEPTED_EXT.test(f.name))

        if (files.length === 0) {
          return Response.redirect('/', 303)
        }

        const cache = await caches.open(SHARE_CACHE)
        // Alte Einträge löschen
        const oldKeys = await cache.keys()
        await Promise.all(oldKeys.map((k) => cache.delete(k)))

        const metadata = []
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          metadata.push({ name: file.name, type: file.type, size: file.size })
          await cache.put(
            `/share-target-file/${i}`,
            new Response(file, {
              headers: {
                'Content-Type': file.type || 'application/octet-stream',
                'X-Filename': encodeURIComponent(file.name),
              },
            })
          )
        }

        await cache.put(
          '/share-target-meta',
          new Response(JSON.stringify(metadata), {
            headers: { 'Content-Type': 'application/json' },
          })
        )

        return Response.redirect('/?share-target', 303)
      })()
    )
    return
  }

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
