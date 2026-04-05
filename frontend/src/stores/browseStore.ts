import { create } from 'zustand'
import { api } from '@/api/client.ts'
import { useAppStore } from '@/stores/appStore.ts'
import type { BrowseResponse, DropboxEntry } from '@/types/index.ts'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes (mutations invalidate immediately)
const MAX_CACHE_ENTRIES = 50

// Request deduplication: prevent duplicate concurrent fetches for the same path
const inflight = new Map<string, Promise<void>>()

interface CacheEntry {
  entries: DropboxEntry[]
  timestamp: number
}

interface BrowseStore {
  cache: Record<string, CacheEntry>
  currentPath: string
  currentEntries: DropboxEntry[]
  loading: boolean
  refreshing: boolean // background refresh (no skeleton)
  error: string

  loadFolder: (path: string, forceRefresh?: boolean) => Promise<void>
  invalidate: (path: string) => void
  clearAll: () => void
}

export const useBrowseStore = create<BrowseStore>((set, get) => ({
  cache: {},
  currentPath: '',
  currentEntries: [],
  loading: false,
  refreshing: false,
  error: '',

  loadFolder: async (path: string, forceRefresh = false) => {
    const state = get()
    const cached = state.cache[path]
    const now = Date.now()
    const isFresh = cached && (now - cached.timestamp < CACHE_TTL)

    // Fresh cache hit: show cached data, no API call
    if (isFresh && !forceRefresh) {
      set({ currentPath: path, currentEntries: cached.entries, error: '' })
      useAppStore.getState().setBrowsePath(path)
      return
    }

    // Stale cache: show cached data immediately, fetch in background
    if (cached && !forceRefresh) {
      set({ currentPath: path, currentEntries: cached.entries, error: '', refreshing: true })
      useAppStore.getState().setBrowsePath(path)
    } else {
      // No cache: show loading skeleton
      set({ currentPath: path, currentEntries: forceRefresh ? state.currentEntries : [], loading: !forceRefresh && !cached, refreshing: forceRefresh || !!cached, error: '' })
      if (forceRefresh) {
        useAppStore.getState().setBrowsePath(path)
      }
    }

    // Deduplicate: if a request for this path is already in flight, await it
    const dedupeKey = `${path}:${forceRefresh}`
    const existing = inflight.get(dedupeKey)
    if (existing) {
      return existing
    }

    const promise = (async () => {
      try {
        const refreshParam = forceRefresh ? '&refresh=true' : ''
        const data = await api<BrowseResponse>(`/dropbox/browse?path=${encodeURIComponent(path)}${refreshParam}`)

        // Update cache (LRU eviction)
        const newCache = { ...get().cache }
        newCache[path] = { entries: data.entries, timestamp: Date.now() }

        // Evict oldest if over limit
        const keys = Object.keys(newCache)
        if (keys.length > MAX_CACHE_ENTRIES) {
          let oldestKey = keys[0]
          let oldestTime = newCache[oldestKey].timestamp
          for (const k of keys) {
            if (newCache[k].timestamp < oldestTime) {
              oldestKey = k
              oldestTime = newCache[k].timestamp
            }
          }
          delete newCache[oldestKey]
        }

        set({
          cache: newCache,
          currentPath: data.path,
          currentEntries: data.entries,
          loading: false,
          refreshing: false,
          error: data.error || '',
        })
        useAppStore.getState().setBrowsePath(data.path)
      } catch (err) {
        set({
          loading: false,
          refreshing: false,
          error: err instanceof Error ? err.message : 'Fehler beim Laden',
        })
      }
    })()

    inflight.set(dedupeKey, promise)
    try {
      await promise
    } finally {
      inflight.delete(dedupeKey)
    }
  },

  invalidate: (path: string) => {
    const newCache = { ...get().cache }
    delete newCache[path]
    // Also invalidate parent
    const parent = path.split('/').slice(0, -1).join('/') || ''
    delete newCache[parent]
    set({ cache: newCache })
  },

  clearAll: () => set({ cache: {} }),
}))
