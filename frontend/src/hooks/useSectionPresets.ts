import { create } from 'zustand'
import { api } from '@/api/client.ts'
import type { SectionPreset } from '@/types/index.ts'

interface SectionPresetsState {
  presets: SectionPreset[]
  loaded: boolean
  load: () => Promise<void>
}

export const useSectionPresetsStore = create<SectionPresetsState>((set, get) => ({
  presets: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return
    try {
      const data = await api<SectionPreset[]>('/section-presets')
      set({ presets: data, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
}))
