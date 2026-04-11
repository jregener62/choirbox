/**
 * Policy-Store — haelt die aktive Policy-Sicht des eingeloggten Users.
 *
 * Wird beim Bootstrap und nach jedem Login geladen (via `loadPolicy`).
 * Bietet Helper `hasPermission`/`hasFeature` fuer UI-Gating.
 */

import { create } from 'zustand'

import { api } from '@/api/client'
import type { PolicyResponse } from '@/types/policy'

interface PolicyState {
  policy: PolicyResponse | null
  loading: boolean
  error: string | null
  loadPolicy: () => Promise<void>
  clear: () => void
  hasPermission: (perm: string) => boolean
  hasFeature: (feature: string) => boolean
}

export const usePolicyStore = create<PolicyState>((set, get) => ({
  policy: null,
  loading: false,
  error: null,

  loadPolicy: async () => {
    set({ loading: true, error: null })
    try {
      const data = await api<PolicyResponse>('/policy/active', { silent: true })
      set({ policy: data, loading: false })
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Policy konnte nicht geladen werden',
      })
    }
  },

  clear: () => set({ policy: null, error: null }),

  hasPermission: (perm: string) => {
    const p = get().policy
    if (!p) return false
    return p.user.allowed_permissions.includes(perm)
  },

  hasFeature: (feature: string) => {
    const p = get().policy
    if (!p) return false
    return p.user.allowed_features.includes(feature)
  },
}))
