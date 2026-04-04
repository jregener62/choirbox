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
const AUDIO_FOLDERS = ['audio', 'multitrack']

function deriveSongFolder(trackPath: string): string | null {
  const segments = trackPath.split('/').filter(Boolean)
  segments.pop() // remove filename
  if (segments.length === 0) return null

  const lastSegment = segments[segments.length - 1]
  // If inside a reserved folder (Audio, Multitrack), go up to .song parent
  if (isReservedName(lastSegment) && segments.length >= 2) {
    return '/' + segments.slice(0, -1).join('/')
  }
  // If directly in a .song folder
  if (lastSegment.endsWith('.song')) {
    return '/' + segments.join('/')
  }
  // Fallback: use the folder the file is in
  return '/' + segments.join('/')
}

async function loadAudioFromFolder(folderPath: string): Promise<SiblingTrack[]> {
  try {
    const data = await api<BrowseResponse>(`/dropbox/browse?path=${encodeURIComponent(folderPath)}`)
    return data.entries
      .filter((e: DropboxEntry) => e.type === 'file' && AUDIO_EXTENSIONS.test(e.name))
      .map((e: DropboxEntry): SiblingTrack => ({
        path: e.path,
        name: e.name,
        voiceKey: e.voice_keys || null,
        duration: e.duration ?? null,
      }))
  } catch {
    return []
  }
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

    const songFolder = deriveSongFolder(currentPath)
    if (!songFolder) { setTracks([]); return }

    // Don't reload if same song folder
    if (songFolder === loadedFolderRef.current) return

    loadedFolderRef.current = songFolder
    let cancelled = false

    // Load audio files from Audio/ and Multitrack/ subfolders
    Promise.all(
      AUDIO_FOLDERS.map((sub) => loadAudioFromFolder(`${songFolder}/${sub}`))
    ).then((results) => {
      if (cancelled) return
      setTracks(results.flat())
    })

    return () => { cancelled = true }
  }, [currentPath])

  return tracks
}
