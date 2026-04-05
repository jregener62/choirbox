import { create } from 'zustand'

type Theme = 'dark' | 'light'

interface AppState {
  theme: Theme
  activeRequests: number
  browsePath: string
  browseReturnTo: string | null
  modalOpen: boolean
  highlightPath: string | null
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setBrowsePath: (path: string) => void
  setBrowseReturnTo: (path: string | null) => void
  setModalOpen: (open: boolean) => void
  setHighlightPath: (path: string | null) => void
  incrementRequests: () => void
  decrementRequests: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: (localStorage.getItem('choirbox_theme') as Theme) || 'light',
  activeRequests: 0,
  browsePath: '',
  browseReturnTo: null,
  modalOpen: false,
  highlightPath: null,

  setTheme: (theme) => {
    localStorage.setItem('choirbox_theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },

  setBrowsePath: (path) => set({ browsePath: path }),
  setBrowseReturnTo: (path) => set({ browseReturnTo: path }),
  setModalOpen: (open) => set({ modalOpen: open }),
  setHighlightPath: (path) => set({ highlightPath: path }),
  incrementRequests: () => set((s) => ({ activeRequests: s.activeRequests + 1 })),
  decrementRequests: () => set((s) => ({ activeRequests: Math.max(0, s.activeRequests - 1) })),
}))
