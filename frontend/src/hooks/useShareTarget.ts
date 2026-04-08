import { useState, useEffect } from 'react'

const SHARE_CACHE = 'share-target-files'

export function useShareTarget(): File[] {
  const [sharedFiles, setSharedFiles] = useState<File[]>([])

  useEffect(() => {
    if (!window.location.search.includes('share-target')) return

    let cancelled = false

    async function loadSharedFiles() {
      try {
        const cache = await caches.open(SHARE_CACHE)
        const metaResponse = await cache.match('/share-target-meta')
        if (!metaResponse) return

        const metadata: Array<{ name: string; type: string; size: number }> =
          await metaResponse.json()

        const files: File[] = []
        for (let i = 0; i < metadata.length; i++) {
          const resp = await cache.match(`/share-target-file/${i}`)
          if (!resp) continue
          const blob = await resp.blob()
          const filename = decodeURIComponent(
            resp.headers.get('X-Filename') || metadata[i].name,
          )
          files.push(new File([blob], filename, { type: metadata[i].type }))
        }

        if (!cancelled && files.length > 0) {
          setSharedFiles(files)
        }

        // Cache aufräumen und URL-Param entfernen
        await caches.delete(SHARE_CACHE)
        const url = new URL(window.location.href)
        url.searchParams.delete('share-target')
        history.replaceState(null, '', url.pathname + url.hash)
      } catch (err) {
        console.error('Share-Target: Dateien konnten nicht geladen werden', err)
      }
    }

    loadSharedFiles()
    return () => { cancelled = true }
  }, [])

  return sharedFiles
}
