import { create } from 'zustand'
import type { User, LoginResponse } from '@/types/index'
import { usePolicyStore } from '@/stores/policyStore'
import { useViewModeStore } from '@/stores/viewModeStore'

const STORAGE_PREFIX = 'choirbox_'
const EXPIRES_KEY = `${STORAGE_PREFIX}session_expires_at`
const GUEST_GOODBYE_FLAG = `${STORAGE_PREFIX}guest_goodbye`

interface GuestRedeemApiResponse extends LoginResponse {
  /** Seconds until the guest session expires (~7200 = 2h). */
  expires_in?: number
  /** Ansichts-Modus: "songs" (alles) oder "texts" (nur Texte). */
  view_mode?: string
}

function loadStoredSession(): {
  token: string | null
  user: User | null
  sessionExpiresAt: Date | null
} {
  try {
    const token = localStorage.getItem(`${STORAGE_PREFIX}token`)
    const userJson = localStorage.getItem(`${STORAGE_PREFIX}user`)
    const expiresIso = localStorage.getItem(EXPIRES_KEY)
    if (token && userJson) {
      const user = JSON.parse(userJson) as User
      let expires: Date | null = null
      if (expiresIso) {
        const d = new Date(expiresIso)
        if (!Number.isNaN(d.getTime())) {
          // Already expired at app start? Drop the whole session.
          if (d.getTime() < Date.now()) {
            clearStoredSession()
            sessionStorage.setItem(GUEST_GOODBYE_FLAG, '1')
            return { token: null, user: null, sessionExpiresAt: null }
          }
          expires = d
        }
      }
      return { token, user, sessionExpiresAt: expires }
    }
  } catch {
    clearStoredSession()
  }
  return { token: null, user: null, sessionExpiresAt: null }
}

function clearStoredSession() {
  localStorage.removeItem(`${STORAGE_PREFIX}token`)
  localStorage.removeItem(`${STORAGE_PREFIX}user`)
  localStorage.removeItem(EXPIRES_KEY)
}

const stored = loadStoredSession()

interface AuthState {
  token: string | null
  user: User | null
  /** Harte Ablaufzeit der Session. Fuer Gaeste immer gesetzt (2h),
   *  fuer normale User typischerweise null (globale 7-Tage-TTL). */
  sessionExpiresAt: Date | null
  login: (username: string, password: string) => Promise<void>
  register: (data: {
    invite_code: string
    username: string
    password: string
  }) => Promise<void>
  redeemGuestLink: (token: string) => Promise<void>
  logout: () => void
  /** Wird von api/client.ts bei 401 fuer Gaeste aufgerufen. Setzt
   *  das Goodbye-Flag, damit der AuthGuard zur /guest-goodbye-Seite
   *  statt zu /login redirected. */
  expireGuestSession: () => void
  restoreSession: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: stored.token,
  user: stored.user,
  sessionExpiresAt: stored.sessionExpiresAt,

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
    localStorage.removeItem(EXPIRES_KEY)
    set({ token: data.token, user: data.user, sessionExpiresAt: null })
    useViewModeStore.getState().applyUserViewMode(data.user)
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
    localStorage.removeItem(EXPIRES_KEY)
    set({ token: result.token, user: result.user, sessionExpiresAt: null })
    useViewModeStore.getState().applyUserViewMode(result.user)
    void usePolicyStore.getState().loadPolicy()
  },

  redeemGuestLink: async (token) => {
    const response = await fetch('/api/guest-links/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(
        (err as { detail?: string }).detail || 'Gast-Link konnte nicht eingeloest werden',
      )
    }
    const data = (await response.json()) as GuestRedeemApiResponse
    const expiresAt =
      typeof data.expires_in === 'number'
        ? new Date(Date.now() + data.expires_in * 1000)
        : null

    localStorage.setItem(`${STORAGE_PREFIX}token`, data.token)
    localStorage.setItem(`${STORAGE_PREFIX}user`, JSON.stringify(data.user))
    if (expiresAt) {
      localStorage.setItem(EXPIRES_KEY, expiresAt.toISOString())
    } else {
      localStorage.removeItem(EXPIRES_KEY)
    }
    // Eine frische Session — altes "expired"-Flag wegraeumen, sonst
    // wuerde der AuthGuard den Gast direkt wieder auf /guest-goodbye
    // schicken.
    sessionStorage.removeItem(GUEST_GOODBYE_FLAG)
    set({ token: data.token, user: data.user, sessionExpiresAt: expiresAt })
    void usePolicyStore.getState().loadPolicy()
    // Ansichts-Modus aus dem Link uebernehmen und sperren.
    const vm = data.view_mode === 'texts' ? 'texts' : 'songs'
    useViewModeStore.getState().lockMode(vm)
  },

  logout: () => {
    const { user } = useAuthStore.getState()
    const isGuest = user?.role === 'guest'
    const token = localStorage.getItem(`${STORAGE_PREFIX}token`)
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    clearStoredSession()
    if (isGuest) {
      try { sessionStorage.setItem(GUEST_GOODBYE_FLAG, '1') } catch { /* ignore */ }
    }
    set({ token: null, user: null, sessionExpiresAt: null })
    usePolicyStore.getState().clear()
    useViewModeStore.getState().reset()
  },

  expireGuestSession: () => {
    // Server-seitig ist die Session bereits weg (401). Lokal cleanen
    // und ein Flag setzen, damit der AuthGuard zur Gast-Expired-Page
    // redirected statt zur Login-Seite.
    clearStoredSession()
    try {
      sessionStorage.setItem(GUEST_GOODBYE_FLAG, '1')
    } catch {
      /* ignore */
    }
    set({ token: null, user: null, sessionExpiresAt: null })
    usePolicyStore.getState().clear()
  },

  restoreSession: () => {
    const s = loadStoredSession()
    set({
      token: s.token,
      user: s.user,
      sessionExpiresAt: s.sessionExpiresAt,
    })
    useViewModeStore.getState().applyUserViewMode(s.user)
  },
}))

// View-Mode aus gespeicherter Session uebernehmen (greift beim Page-Reload,
// sobald die Module geladen sind — der Store ist schon mit `stored.user`
// initialisiert).
if (stored.user) {
  useViewModeStore.getState().applyUserViewMode(stored.user)
}

/** True if the AuthGuard should redirect to the guest goodbye page
 *  instead of /login (after logout or session expiry). */
export function consumeGuestGoodbyeFlag(): boolean {
  const raw = sessionStorage.getItem(GUEST_GOODBYE_FLAG)
  return raw === '1'
}

export function clearGuestGoodbyeFlag(): void {
  sessionStorage.removeItem(GUEST_GOODBYE_FLAG)
}
