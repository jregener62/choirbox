import { create } from 'zustand'
import { stripFolderExtension } from '@/utils/folderTypes'

interface RecordingStore {
  songFolderPath: string | null   // Song-Modus: .song-Ordner-Pfad
  songFolderName: string | null   // Song-Modus: Anzeigename
  basePath: string | null         // Root-Modus: Eltern-Pfad fuer neuen .song-Ordner

  /** Start a recording session for a .song folder (Song-Modus). */
  startSession: (songFolderPath: string) => boolean
  /** Start a recording session outside a .song folder (Root-Modus). */
  startRootSession: (basePath: string) => boolean
  /** End the current recording session. */
  endSession: () => void
}

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  songFolderPath: null,
  songFolderName: null,
  basePath: null,

  startSession: (songFolderPath: string) => {
    if (get().songFolderPath || get().basePath) return false
    const segments = songFolderPath.split('/').filter(Boolean)
    const folderSegment = segments[segments.length - 1] || ''
    set({
      songFolderPath,
      songFolderName: stripFolderExtension(folderSegment),
      basePath: null,
    })
    return true
  },

  startRootSession: (basePath: string) => {
    if (get().songFolderPath || get().basePath) return false
    set({
      songFolderPath: null,
      songFolderName: null,
      basePath,
    })
    return true
  },

  endSession: () => {
    set({ songFolderPath: null, songFolderName: null, basePath: null })
  },
}))
