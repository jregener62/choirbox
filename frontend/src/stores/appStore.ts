import { create } from 'zustand'

type Theme = 'dark' | 'light'
export type ZoomLevel = 'normal' | 'large' | 'xlarge'

export const ZOOM_VALUES: Record<ZoomLevel, number> = {
  normal: 1.0,
  large: 1.125,
  xlarge: 1.25,
}

export const ZOOM_LABELS: Record<ZoomLevel, string> = {
  normal: 'Normal',
  large: 'Groß',
  xlarge: 'Sehr groß',
}

interface AppState {
  theme: Theme
  zoomLevel: ZoomLevel
  activeRequests: number
  browsePath: string
  browseReturnTo: string | null
  modalOpen: boolean
  highlightPath: string | null
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setZoomLevel: (level: ZoomLevel) => void
  setBrowsePath: (path: string) => void
  setBrowseReturnTo: (path: string | null) => void
  setModalOpen: (open: boolean) => void
  setHighlightPath: (path: string | null) => void
  incrementRequests: () => void
  decrementRequests: () => void
}

function applyZoom(level: ZoomLevel) {
  const value = ZOOM_VALUES[level]
  const root = document.getElementById('root')
  if (!root) return
  if (value === 1) {
    root.style.removeProperty('zoom')
    root.style.removeProperty('width')
    root.style.removeProperty('height')
  } else {
    root.style.zoom = String(value)
    root.style.width = `${100 / value}%`
    root.style.height = `${100 / value}%`
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: (localStorage.getItem('choirbox_theme') as Theme) || 'light',
  zoomLevel: (localStorage.getItem('choirbox_zoom') as ZoomLevel) || 'normal',
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

  setZoomLevel: (level) => {
    localStorage.setItem('choirbox_zoom', level)
    applyZoom(level)
    set({ zoomLevel: level })
  },

  setBrowsePath: (path) => set({ browsePath: path }),
  setBrowseReturnTo: (path) => set({ browseReturnTo: path }),
  setModalOpen: (open) => set({ modalOpen: open }),
  setHighlightPath: (path) => set({ highlightPath: path }),
  incrementRequests: () => set((s) => ({ activeRequests: s.activeRequests + 1 })),
  decrementRequests: () => set((s) => ({ activeRequests: Math.max(0, s.activeRequests - 1) })),
}))
