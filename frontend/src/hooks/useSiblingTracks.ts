import { useState, useEffect, useRef } from 'react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { api } from '@/api/client.ts'
import { isReservedName } from '@/utils/folderTypes.ts'
import type { BrowseResponse, DropboxEntry } from '@/types/index.ts'

export interface SiblingTrack {
  path: string
  name: string
  voiceKey: string | null
  duration: number | null
}

const AUDIO_EXTENSIONS = /\.(mp3|m4a|wav|ogg|flac|aac|webm)$/i

function deriveAudioFolder(trackPath: string): string | null {
  const segments = trackPath.split('/').filter(Boolean)
  // Remove filename
  segments.pop()
  if (segments.length === 0) return null

  const lastSegment = segments[segments.length - 1]
  // If already in Audio/ folder, use it
  if (isReservedName(lastSegment)) {
    return '/' + segments.join('/')
  }
  // If in a .song folder directly, try Audio/ subfolder
  if (segments[segments.length - 1]?.endsWith('.song')) {
    return '/' + [...segments, 'Audio'].join('/')
  }
  // Fallback: use the folder the file is in
  return '/' + segments.join('/')
}

export function useSiblingTracks(): SiblingTrack[] {
  const currentPath = usePlayerStore((s) => s.currentPath)
  const [tracks, setTracks] = useState<SiblingTrack[]>([])
  const loadedFolderRef = useRef<string | null>(null)

  useEffect(() => {
    if (!currentPath) {
      setTracks([])
      loadedFolderRef.current = null
      return
    }

    const audioFolder = deriveAudioFolder(currentPath)
    if (!audioFolder) { setTracks([]); return }

    // Don't reload if same folder
    if (audioFolder === loadedFolderRef.current) return

    loadedFolderRef.current = audioFolder
    let cancelled = false

    api<BrowseResponse>(`/dropbox/browse?path=${encodeURIComponent(audioFolder)}`)
      .then((data) => {
        if (cancelled) return
        const audioEntries = data.entries
          .filter((e: DropboxEntry) => e.type === 'file' && AUDIO_EXTENSIONS.test(e.name))
          .map((e: DropboxEntry): SiblingTrack => ({
            path: e.path,
            name: e.name,
            voiceKey: e.voice_keys || null,
            duration: e.duration ?? null,
          }))
        setTracks(audioEntries)
      })
      .catch(() => {
        if (!cancelled) setTracks([])
      })

    return () => { cancelled = true }
  }, [currentPath])

  return tracks
}
