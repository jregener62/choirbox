import { create } from 'zustand'
import { api } from '@/api/client.ts'
import type { Section, Note } from '@/types/index.ts'

interface SectionsNotesState {
  notes: Note[]
  notesLoadedPath: string | null
  loading: boolean

  loadNotes: (dropboxPath: string) => Promise<void>
  reset: () => void

  // Lyrics (shared, pro-member+)
  saveLyricsBulk: (sections: { id: number; lyrics: string }[]) => Promise<void>

  // Notes (per user)
  saveNote: (dropboxPath: string, sectionId: number | null, text: string) => Promise<void>
  saveNotesBulk: (dropboxPath: string, notes: { section_id: number | null; text: string }[]) => Promise<void>

  // Helpers
  getTrackNote: () => Note | undefined
  getSectionNote: (sectionId: number) => Note | undefined
  getCurrentSection: (sections: Section[], time: number, leadSeconds?: number) => Section | undefined
  getNextSection: (sections: Section[], time: number, leadSeconds?: number) => Section | undefined
}

export const useSectionsNotesStore = create<SectionsNotesState>((set, get) => ({
  notes: [],
  notesLoadedPath: null,
  loading: false,

  loadNotes: async (dropboxPath: string) => {
    set({ loading: true })
    try {
      const notes = await api<Note[]>(`/notes?path=${encodeURIComponent(dropboxPath)}`)
      set({ notes, notesLoadedPath: dropboxPath, loading: false })
    } catch {
      set({ loading: false, notesLoadedPath: dropboxPath })
    }
  },

  reset: () => set({ notes: [], notesLoadedPath: null, loading: false }),

  saveLyricsBulk: async (sections) => {
    await api('/sections/lyrics', {
      method: 'PUT',
      body: { sections },
    })
  },

  saveNote: async (dropboxPath, sectionId, text) => {
    await api('/notes', {
      method: 'PUT',
      body: { dropbox_path: dropboxPath, section_id: sectionId, text },
    })
    const notes = await api<Note[]>(`/notes?path=${encodeURIComponent(dropboxPath)}`)
    set({ notes })
  },

  saveNotesBulk: async (dropboxPath, notes) => {
    await api('/notes/bulk', {
      method: 'PUT',
      body: { dropbox_path: dropboxPath, notes },
    })
    const updated = await api<Note[]>(`/notes?path=${encodeURIComponent(dropboxPath)}`)
    set({ notes: updated })
  },

  getTrackNote: () => {
    return get().notes.find((n) => n.section_id === null)
  },

  getSectionNote: (sectionId: number) => {
    return get().notes.find((n) => n.section_id === sectionId)
  },

  getCurrentSection: (_sections: Section[], time: number, leadSeconds = 3) => {
    for (const s of _sections) {
      const showFrom = Math.max(0, s.start_time - leadSeconds)
      if (time >= showFrom && time < s.end_time) return s
    }
    if (_sections.length > 0 && time >= _sections[_sections.length - 1].start_time) {
      return _sections[_sections.length - 1]
    }
    return undefined
  },

  getNextSection: (_sections: Section[], time: number, leadSeconds = 3) => {
    const current = get().getCurrentSection(_sections, time, leadSeconds)
    if (!current) return _sections[0]
    const idx = _sections.findIndex((s) => s.id === current.id)
    return idx < _sections.length - 1 ? _sections[idx + 1] : undefined
  },
}))
