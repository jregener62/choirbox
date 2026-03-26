import { useState, useEffect, useRef } from 'react'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'

interface PreviewLink {
  link: string
  expires_in: number
  cachedAt: number
}

// Share the link cache with useAudioPlayer (same format)
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

// Cache computed peaks per path so we don't re-decode on every render
const peaksCache = new Map<string, number[]>()

const NUM_BARS = 200

/**
 * Decode audio and compute waveform peaks for visualization.
 */
export function useWaveform(dropboxPath: string | null) {
  const [peaks, setPeaks] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!dropboxPath) {
      setPeaks([])
      return
    }

    // Use cached peaks if available
    const cached = peaksCache.get(dropboxPath)
    if (cached) {
      setPeaks(cached)
      return
    }

    // Abort previous fetch if path changed
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const compute = async () => {
      setLoading(true)
      try {
        const link = await fetchStreamLink(dropboxPath)
        if (controller.signal.aborted) return

        // Fetch raw audio bytes
        const response = await fetch(link, { signal: controller.signal })
        const arrayBuffer = await response.arrayBuffer()
        if (controller.signal.aborted) return

        // Decode audio data
        const audioCtx = new AudioContext()
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
        await audioCtx.close()
        if (controller.signal.aborted) return

        // Set precise duration from decoded audio (immediate, no waiting for loadedmetadata)
        if (audioBuffer.duration && isFinite(audioBuffer.duration)) {
          usePlayerStore.getState().setDuration(audioBuffer.duration)
        }

        // Compute peaks from first channel
        const channelData = audioBuffer.getChannelData(0)
        const samplesPerBar = Math.floor(channelData.length / NUM_BARS)
        const computed: number[] = []

        for (let i = 0; i < NUM_BARS; i++) {
          let max = 0
          const start = i * samplesPerBar
          const end = Math.min(start + samplesPerBar, channelData.length)
          for (let j = start; j < end; j++) {
            const abs = Math.abs(channelData[j])
            if (abs > max) max = abs
          }
          computed.push(max)
        }

        // Normalize to 0-1
        const peak = Math.max(...computed, 0.01)
        const normalized = computed.map((v) => v / peak)

        peaksCache.set(dropboxPath, normalized)
        setPeaks(normalized)
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          console.error('Waveform computation failed:', err)
        }
      } finally {
        setLoading(false)
      }
    }

    compute()

    return () => {
      controller.abort()
    }
  }, [dropboxPath])

  return { peaks, loading }
}
