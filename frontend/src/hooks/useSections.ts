import { create } from 'zustand'
import { api } from '@/api/client.ts'
import type { Section } from '@/types/index.ts'

interface SectionsState {
  sections: Section[]
  loadedPath: string | null
  loading: boolean

  load: (dropboxPath: string) => Promise<void>
  create: (data: {
    dropbox_path: string
    label: string
    color: string
    start_time: number
    end_time: number
    sort_order: number
  }) => Promise<void>
  update: (id: number, data: Partial<Section>) => Promise<void>
  remove: (id: number) => Promise<void>
  clear: () => void
}

export const useSectionsStore = create<SectionsState>((set, get) => ({
  sections: [],
  loadedPath: null,
  loading: false,

  load: async (dropboxPath: string) => {
    set({ loading: true })
    try {
      const data = await api<Section[]>(`/sections?path=${encodeURIComponent(dropboxPath)}`)
      set({ sections: data, loadedPath: dropboxPath, loading: false })
    } catch {
      set({ sections: [], loadedPath: dropboxPath, loading: false })
    }
  },

  create: async (data) => {
    await api('/sections', { method: 'POST', body: data })
    const path = get().loadedPath
    if (path) await get().load(path)
  },

  update: async (id, data) => {
    await api(`/sections/${id}`, { method: 'PUT', body: data })
    const path = get().loadedPath
    if (path) await get().load(path)
  },

  remove: async (id) => {
    await api(`/sections/${id}`, { method: 'DELETE' })
    const path = get().loadedPath
    if (path) await get().load(path)
  },

  clear: () => set({ sections: [], loadedPath: null }),
}))
