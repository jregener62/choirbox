/**
 * Display-Mode-Store — steuert, ob .cho-Dateien Akkorde rendern und Akkord-
 * Edit-Tools anbieten. Orthogonal zum viewModeStore (songs/texts).
 *
 * Der Wert kommt vom Chor (Choir.display_mode) und ist fuer den User nicht
 * direkt editierbar. Bei "gemischt" darf der User pro Song zwischen
 * Akkord-Anzeige an/aus umschalten — die Wahl kann spaeter persistiert
 * werden (Phase 5), fuer jetzt reicht der nicht-persistente Fall.
 */

import { create } from 'zustand'
import type { User } from '@/types/index'

export type ChoirDisplayMode = 'vocal' | 'instrumental' | 'gemischt'

interface DisplayModeState {
  choirMode: ChoirDisplayMode
  /** Synchronisiert den Store mit User.choir_display_mode. */
  applyUserDisplayMode: (user: User | null) => void
  /** Reset beim Logout — faellt auf den sichersten Default zurueck. */
  reset: () => void
}

export const useDisplayModeStore = create<DisplayModeState>((set) => ({
  choirMode: 'instrumental',

  applyUserDisplayMode: (user) => {
    if (!user) {
      set({ choirMode: 'instrumental' })
      return
    }
    set({ choirMode: user.choir_display_mode ?? 'instrumental' })
  },

  reset: () => {
    set({ choirMode: 'instrumental' })
  },
}))
