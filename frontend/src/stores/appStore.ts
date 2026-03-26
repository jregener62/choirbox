import { create } from 'zustand'

type Theme = 'dark' | 'light'

interface AppState {
  theme: Theme
  activeRequests: number
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  incrementRequests: () => void
  decrementRequests: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: (localStorage.getItem('choirbox_theme') as Theme) || 'dark',
  activeRequests: 0,

  setTheme: (theme) => {
    localStorage.setItem('choirbox_theme', theme)
    document.documentElement.setAttribute('data-theme', theme)
    set({ theme })
  },

  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },

  incrementRequests: () => set((s) => ({ activeRequests: s.activeRequests + 1 })),
  decrementRequests: () => set((s) => ({ activeRequests: Math.max(0, s.activeRequests - 1) })),
}))
