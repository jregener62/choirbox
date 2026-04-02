import { create } from 'zustand'
import { api } from '@/api/client.ts'
import type { Section } from '@/types/index.ts'

interface SectionsState {
  sections: Section[]
  loadedFolder: string | null
  loading: boolean

  load: (folderPath: string) => Promise<void>
  create: (data: {
    folder_path: string
    label: string
    color: string
    start_time: number
    end_time: number
    sort_order: number
  }) => Promise<void>
  bulkCreate: (data: {
    folder_path: string
    sections: Array<{ label: string; color: string; start_time: number; end_time: number; sort_order: number }>
  }) => Promise<void>
  update: (id: number, data: Partial<Section>) => Promise<void>
  batchUpdate: (updates: Array<{ id: number; data: Partial<Section> }>) => Promise<void>
  remove: (id: number) => Promise<void>
  clear: () => void
}

export const useSectionsStore = create<SectionsState>((set, get) => ({
  sections: [],
  loadedFolder: null,
  loading: false,

  load: async (folderPath: string) => {
    set({ loading: true })
    try {
      const data = await api<Section[]>(`/sections?folder=${encodeURIComponent(folderPath)}`)
      set({ sections: data, loadedFolder: folderPath, loading: false })
    } catch {
      set({ sections: [], loadedFolder: folderPath, loading: false })
    }
  },

  create: async (data) => {
    await api('/sections', { method: 'POST', body: data })
    const folder = get().loadedFolder
    if (folder) await get().load(folder)
  },

  bulkCreate: async (data) => {
    await api('/sections/bulk', { method: 'POST', body: data })
    const folder = get().loadedFolder
    if (folder) await get().load(folder)
  },

  update: async (id, data) => {
    await api(`/sections/${id}`, { method: 'PUT', body: data })
    const folder = get().loadedFolder
    if (folder) await get().load(folder)
  },

  batchUpdate: async (updates) => {
    await Promise.all(updates.map(u => api(`/sections/${u.id}`, { method: 'PUT', body: u.data })))
    const folder = get().loadedFolder
    if (folder) await get().load(folder)
  },

  remove: async (id) => {
    await api(`/sections/${id}`, { method: 'DELETE' })
    const folder = get().loadedFolder
    if (folder) await get().load(folder)
  },

  clear: () => set({ sections: [], loadedFolder: null }),
}))
