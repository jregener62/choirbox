/**
 * View-Mode-Store — steuert ob die Browse-Ansicht Songs (mit Audio)
 * oder nur Texte/Chord-Sheets zeigt.
 *
 * Members koennen frei zwischen Songs und Texte umschalten (localStorage).
 * Gaeste bekommen den Modus vom Admin beim Erstellen des Guest-Links
 * zugewiesen und koennen ihn nicht aendern (`locked`).
 */

import { create } from 'zustand'

export type ViewMode = 'songs' | 'texts'

const STORAGE_KEY = 'choirbox_view_mode'

function loadStoredMode(): ViewMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'texts') return 'texts'
  } catch {
    // ignore
  }
  return 'songs'
}

interface ViewModeState {
  mode: ViewMode
  /** True wenn der User den Modus nicht wechseln darf (Gast mit festem Modus). */
  locked: boolean
  setMode: (m: ViewMode) => void
  /** Wird beim Guest-Redeem aufgerufen — setzt den Modus und sperrt ihn. */
  lockMode: (m: ViewMode) => void
  /** Reset beim Logout. */
  reset: () => void
}

export const useViewModeStore = create<ViewModeState>((set) => ({
  mode: loadStoredMode(),
  locked: false,

  setMode: (m) => {
    try {
      localStorage.setItem(STORAGE_KEY, m)
    } catch {
      // ignore
    }
    set({ mode: m })
  },

  lockMode: (m) => {
    set({ mode: m, locked: true })
  },

  reset: () => {
    set({ mode: 'songs', locked: false })
  },
}))
