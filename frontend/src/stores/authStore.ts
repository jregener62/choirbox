import { create } from 'zustand'
import type { User, LoginResponse } from '@/types/index'
import { usePolicyStore } from '@/stores/policyStore'

const STORAGE_PREFIX = 'choirbox_'

function loadStoredSession(): { token: string | null; user: User | null } {
  try {
    const token = localStorage.getItem(`${STORAGE_PREFIX}token`)
    const userJson = localStorage.getItem(`${STORAGE_PREFIX}user`)
    if (token && userJson) {
      return { token, user: JSON.parse(userJson) as User }
    }
  } catch {
    localStorage.removeItem(`${STORAGE_PREFIX}token`)
    localStorage.removeItem(`${STORAGE_PREFIX}user`)
  }
  return { token: null, user: null }
}

const stored = loadStoredSession()

interface AuthState {
  token: string | null
  user: User | null
  login: (username: string, password: string) => Promise<void>
  register: (data: {
    invite_code: string
    username: string
    password: string
  }) => Promise<void>
  logout: () => void
  restoreSession: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: stored.token,
  user: stored.user,

  login: async (username, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(
        (err as { detail?: string }).detail || 'Login failed',
      )
    }
    const data = (await response.json()) as LoginResponse
    localStorage.setItem(`${STORAGE_PREFIX}token`, data.token)
    localStorage.setItem(`${STORAGE_PREFIX}user`, JSON.stringify(data.user))
    set({ token: data.token, user: data.user })
    // Policy sofort nachziehen, damit UI-Gating direkt greift.
    void usePolicyStore.getState().loadPolicy()
  },

  register: async (data) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(
        (err as { detail?: string }).detail || 'Registration failed',
      )
    }
    const result = (await response.json()) as LoginResponse
    localStorage.setItem(`${STORAGE_PREFIX}token`, result.token)
    localStorage.setItem(`${STORAGE_PREFIX}user`, JSON.stringify(result.user))
    set({ token: result.token, user: result.user })
    void usePolicyStore.getState().loadPolicy()
  },

  logout: () => {
    const token = localStorage.getItem(`${STORAGE_PREFIX}token`)
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    localStorage.removeItem(`${STORAGE_PREFIX}token`)
    localStorage.removeItem(`${STORAGE_PREFIX}user`)
    set({ token: null, user: null })
    usePolicyStore.getState().clear()
  },

  restoreSession: () => {
    const token = localStorage.getItem(`${STORAGE_PREFIX}token`)
    const userJson = localStorage.getItem(`${STORAGE_PREFIX}user`)
    if (token && userJson) {
      try {
        const user = JSON.parse(userJson) as User
        set({ token, user })
      } catch {
        localStorage.removeItem(`${STORAGE_PREFIX}token`)
        localStorage.removeItem(`${STORAGE_PREFIX}user`)
      }
    }
  },
}))
