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
    const wasFav = get().isFavorite(dropboxPath)

    // Optimistic update: immediately update local state
    if (wasFav) {
      set({ favorites: get().favorites.filter((f) => f.dropbox_path !== dropboxPath) })
    } else {
      const tempFav = {
        id: -Date.now(),
        dropbox_path: dropboxPath,
        file_name: dropboxPath.split('/').pop() || dropboxPath,
        entry_type: entryType,
        created_at: new Date().toISOString(),
      } as Favorite
      set({ favorites: [...get().favorites, tempFav] })
    }

    try {
      const result = await api<{ is_favorite: boolean; id?: number }>(
        '/favorites/toggle',
        { method: 'POST', body: { dropbox_path: dropboxPath, entry_type: entryType } },
      )
      // If server disagrees, reload to correct
      if (result.is_favorite === wasFav) {
        await get().load()
      }
      return result.is_favorite
    } catch {
      // Rollback on error
      await get().load()
      return wasFav
    }
  },
}))
