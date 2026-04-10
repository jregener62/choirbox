import { useEffect, useCallback } from 'react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { api } from '@/api/client.ts'

interface PreviewLink {
  link: string
  expires_in: number
  cachedAt: number
}

const linkCache = new Map<string, PreviewLink>()

function getCachedLink(path: string): string | null {
  const cached = linkCache.get(path)
  if (!cached) return null
  const elapsed = (Date.now() - cached.cachedAt) / 1000
  if (elapsed > cached.expires_in - 60) {
    linkCache.delete(path)
    return null
  }
  return cached.link
}

async function fetchStreamLink(path: string): Promise<string> {
  const cached = getCachedLink(path)
  if (cached) return cached

  const res = await api<{ link: string; expires_in: number }>(
    `/dropbox/stream?path=${encodeURIComponent(path)}`,
  )
  linkCache.set(path, { ...res, cachedAt: Date.now() })
  return res.link
}

// Module-level singleton — one Audio element for the whole app
const audio = new Audio()
audio.preload = 'none'
let currentLoadedPath: string | null = null
let listenersAttached = false

/**
 * Global audio player hook. Can be called from multiple components —
 * they all share the same Audio element via module-level singleton.
 */
export function useAudioPlayer() {
  const currentPath = usePlayerStore((s) => s.currentPath)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  // Attach event listeners once (never removed — singleton lives forever)
  useEffect(() => {
    if (listenersAttached) return
    listenersAttached = true

    audio.addEventListener('timeupdate', () => {
      const store = usePlayerStore.getState()
      store.setCurrentTime(audio.currentTime)

      // Cycle play: jump back to loopStart when reaching loopEnd
      if (store.loopEnabled && store.loopStart !== null && store.loopEnd !== null) {
        if (audio.currentTime >= store.loopEnd) {
          audio.currentTime = store.loopStart
        }
      }
    })

    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration && isFinite(audio.duration)) {
        usePlayerStore.getState().setDuration(audio.duration)
        const path = usePlayerStore.getState().currentPath
        if (path) {
          api('/dropbox/duration', {
            method: 'POST',
            body: { path, duration: audio.duration },
            silent: true,
          }).catch(() => {})
        }
      }
    })

    audio.addEventListener('ended', () => {
      usePlayerStore.getState().setPlaying(false)
      usePlayerStore.getState().setCurrentTime(0)
    })

    audio.addEventListener('error', () => {
      const err = audio.error
      console.error('Audio element error:', err?.code, err?.message, 'src:', audio.currentSrc)
      usePlayerStore.getState().setPlaying(false)
    })
  }, [])

  // Load new track when path changes
  useEffect(() => {
    if (!currentPath) return
    if (currentPath === currentLoadedPath) return

    currentLoadedPath = currentPath
    audio.pause()
    audio.removeAttribute('src')
    audio.load()

    const loadTrack = async () => {
      try {
        const link = await fetchStreamLink(currentPath)
        if (currentLoadedPath !== currentPath) return
        audio.src = link
        audio.load()
        // If play was requested before src was ready, start now
        if (usePlayerStore.getState().isPlaying) {
          audio.play().catch((err) => {
            console.error('Audio play() rejected (deferred):', err)
            usePlayerStore.getState().setPlaying(false)
          })
        }
      } catch (err) {
        console.error('Audio load error:', err)
      }
    }

    loadTrack()
  }, [currentPath])

  // Play/pause sync
  useEffect(() => {
    if (!audio.src) return

    if (isPlaying && audio.paused) {
      audio.play().catch((err) => {
        console.error('Audio play() rejected:', err)
        usePlayerStore.getState().setPlaying(false)
      })
    } else if (!isPlaying && !audio.paused) {
      audio.pause()
    }
  }, [isPlaying])

  const seek = useCallback((time: number) => {
    audio.currentTime = time
    usePlayerStore.getState().setCurrentTime(time)
  }, [])

  const skip = useCallback((seconds: number) => {
    const newTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds))
    audio.currentTime = newTime
    usePlayerStore.getState().setCurrentTime(newTime)
  }, [])

  const togglePlay = useCallback(() => {
    const store = usePlayerStore.getState()
    store.setPlaying(!store.isPlaying)
  }, [])

  return { seek, skip, togglePlay }
}
