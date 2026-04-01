import { create } from 'zustand'
import { api } from '@/api/client.ts'
import type { Favorite } from '@/types/index.ts'

interface FavoritesState {
  favorites: Favorite[]
  loaded: boolean
  load: () => Promise<void>
  isFavorite: (dropboxPath: string) => boolean
  toggle: (dropboxPath: string, entryType?: 'file' | 'folder') => Promise<boolean>
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favorites: [],
  loaded: false,

  load: async () => {
    try {
      const data = await api<Favorite[]>('/favorites')
      set({ favorites: data, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  isFavorite: (dropboxPath: string) => {
    return get().favorites.some((f) => f.dropbox_path === dropboxPath)
  },

  toggle: async (dropboxPath: string, entryType: 'file' | 'folder' = 'file') => {
    const result = await api<{ is_favorite: boolean; id?: number }>(
      '/favorites/toggle',
      { method: 'POST', body: { dropbox_path: dropboxPath, entry_type: entryType } },
    )
    // Reload favorites list to stay in sync
    await get().load()
    return result.is_favorite
  },
}))
