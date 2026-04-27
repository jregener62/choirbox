/**
 * View-Mode-Store — steuert ob die Browse-Ansicht Songs (mit Audio)
 * oder nur Texte/Chord-Sheets zeigt.
 *
 * Members koennen frei zwischen Songs und Texte umschalten (localStorage).
 * Gaeste bekommen den Modus vom Admin beim Erstellen des Guest-Links
 * zugewiesen und koennen ihn nicht aendern (`locked`).
 */

import { create } from 'zustand'
import type { User } from '@/types/index'

export type ViewMode = 'songs' | 'texts'

const STORAGE_KEY = 'choirbox_view_mode'

// Rollen, fuer die der User-seitige view_mode angewendet wird. Chorleiter/Admin/
// Developer brauchen immer vollen Zugriff und ignorieren das Feld.
const VIEW_MODE_APPLICABLE_ROLES = new Set(['guest', 'member', 'pro-member'])

function loadStoredMode(): ViewMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'songs') return 'songs'
  } catch {
    // ignore
  }
  return 'texts'
}

interface ViewModeState {
  mode: ViewMode
  /** True wenn der User den Modus nicht wechseln darf (z.B. Member mit view_mode=texts oder Gast). */
  locked: boolean
  setMode: (m: ViewMode) => void
  /** Wird beim Guest-Redeem aufgerufen — setzt den Modus und sperrt ihn. */
  lockMode: (m: ViewMode) => void
  /** Synchronisiert den Store mit User.view_mode. Chorleiter/Admin bleiben unlocked. */
  applyUserViewMode: (user: User | null) => void
  /** Reset beim Logout. */
  reset: () => void
}

export const useViewModeStore = create<ViewModeState>((set, get) => ({
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

  applyUserViewMode: (user) => {
    if (!user) {
      set({ locked: false })
      return
    }
    const applicable = VIEW_MODE_APPLICABLE_ROLES.has(user.role)
    if (applicable && user.view_mode === 'texts') {
      set({ mode: 'texts', locked: true })
      return
    }
    // Alle anderen: Modus ist frei waehlbar. Aktuell gespeicherten Modus
    // beibehalten, nur das Lock aufheben.
    set({ locked: false, mode: get().mode })
  },

  reset: () => {
    set({ mode: 'texts', locked: false })
  },
}))
