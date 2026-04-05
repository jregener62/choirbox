import { create } from 'zustand'
import { stripFolderExtension } from '@/utils/folderTypes'

interface RecordingStore {
  songFolderPath: string | null
  songFolderName: string | null

  /** Start a recording session for a .song folder. Returns false if already active. */
  startSession: (songFolderPath: string) => boolean
  /** End the current recording session. */
  endSession: () => void
}

export const useRecordingStore = create<RecordingStore>((set, get) => ({
  songFolderPath: null,
  songFolderName: null,

  startSession: (songFolderPath: string) => {
    if (get().songFolderPath) return false
    const segments = songFolderPath.split('/').filter(Boolean)
    const folderSegment = segments[segments.length - 1] || ''
    set({
      songFolderPath,
      songFolderName: stripFolderExtension(folderSegment),
    })
    return true
  },

  endSession: () => {
    set({ songFolderPath: null, songFolderName: null })
  },
}))
