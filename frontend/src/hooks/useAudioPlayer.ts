import { useEffect, useRef, useCallback } from 'react'
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

/**
 * Global audio player hook. Mount once in AppShell.
 * Manages a single HTMLAudioElement and syncs with playerStore.
 */
export function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentPathRef = useRef<string | null>(null)

  // Create audio element once
  if (!audioRef.current) {
    audioRef.current = new Audio()
    audioRef.current.preload = 'none'
  }

  const audio = audioRef.current

  // Subscribe to store changes
  const currentPath = usePlayerStore((s) => s.currentPath)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const loopStart = usePlayerStore((s) => s.loopStart)
  const loopEnd = usePlayerStore((s) => s.loopEnd)
  const loopEnabled = usePlayerStore((s) => s.loopEnabled)

  // Load new track when path changes
  useEffect(() => {
    if (!currentPath) return
    if (currentPath === currentPathRef.current) return

    currentPathRef.current = currentPath
    audio.pause()
    audio.removeAttribute('src')
    audio.load()

    const loadAndPlay = async () => {
      try {
        const link = await fetchStreamLink(currentPath)
        // Check if path still matches (user might have clicked another track)
        if (currentPathRef.current !== currentPath) return
        audio.src = link
        await audio.play()
        usePlayerStore.getState().setPlaying(true)
      } catch (err) {
        console.error('Audio load error:', err)
        usePlayerStore.getState().setPlaying(false)
      }
    }

    loadAndPlay()
  }, [currentPath, audio])

  // Play/pause sync
  useEffect(() => {
    if (!audio.src) return

    if (isPlaying && audio.paused) {
      audio.play().catch(() => {
        usePlayerStore.getState().setPlaying(false)
      })
    } else if (!isPlaying && !audio.paused) {
      audio.pause()
    }
  }, [isPlaying, audio])

  // Time update -> store
  useEffect(() => {
    const onTimeUpdate = () => {
      const store = usePlayerStore.getState()
      store.setCurrentTime(audio.currentTime)

      // Cycle play: jump back to loopStart when reaching loopEnd
      if (store.loopEnabled && store.loopStart !== null && store.loopEnd !== null) {
        if (audio.currentTime >= store.loopEnd) {
          audio.currentTime = store.loopStart
        }
      }
    }

    const onLoadedMetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        usePlayerStore.getState().setDuration(audio.duration)
      }
    }

    const onEnded = () => {
      usePlayerStore.getState().setPlaying(false)
      usePlayerStore.getState().setCurrentTime(0)
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)
    audio.addEventListener('ended', onEnded)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
      audio.removeEventListener('ended', onEnded)
    }
  }, [audio, loopStart, loopEnd, loopEnabled])

  // Seek
  const seek = useCallback((time: number) => {
    audio.currentTime = time
    usePlayerStore.getState().setCurrentTime(time)
  }, [audio])

  // Skip forward/backward
  const skip = useCallback((seconds: number) => {
    const newTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds))
    audio.currentTime = newTime
    usePlayerStore.getState().setCurrentTime(newTime)
  }, [audio])

  const togglePlay = useCallback(() => {
    const store = usePlayerStore.getState()
    store.setPlaying(!store.isPlaying)
  }, [])

  return { seek, skip, togglePlay, audioRef }
}
