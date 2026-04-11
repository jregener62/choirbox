import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api/client.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { isGuest } from '@/utils/roles.ts'

/**
 * Manage per-user transposition preference for a .cho document.
 *
 * - Loads the saved transposition on mount (from server for members,
 *   from sessionStorage for guests — nothing is persisted to the
 *   server for guest users because the guest account is shared).
 * - Returns optimistic local state + a setter that auto-saves with a
 *   debounce.
 * - Cancels in-flight saves on doc change / unmount.
 */
const GUEST_STORAGE_PREFIX = 'choirbox_guest_chord_transposition_'

function readGuestTransposition(docId: number): number {
  try {
    const raw = sessionStorage.getItem(`${GUEST_STORAGE_PREFIX}${docId}`)
    if (raw == null) return 0
    const parsed = parseInt(raw, 10)
    if (Number.isNaN(parsed)) return 0
    return Math.max(-12, Math.min(12, parsed))
  } catch {
    return 0
  }
}

function writeGuestTransposition(docId: number, value: number): void {
  try {
    sessionStorage.setItem(`${GUEST_STORAGE_PREFIX}${docId}`, String(value))
  } catch {
    // sessionStorage unavailable (private mode etc.) — ignore
  }
}

export function useChordPreference(docId: number | null | undefined) {
  const [transposition, setTransposition] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userRole = useAuthStore((s) => s.user?.role)
  const guest = isGuest(userRole)

  // Load preference whenever the document changes
  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    setLoaded(false)
    setTransposition(0)
    if (docId == null) return

    if (guest) {
      // Guests only persist in sessionStorage — nothing on the server.
      setTransposition(readGuestTransposition(docId))
      setLoaded(true)
      return
    }

    let cancelled = false
    api<{ transposition: number }>(`/documents/${docId}/chord-preference`, { silent: true })
      .then((data) => {
        if (!cancelled) {
          setTransposition(data.transposition || 0)
          setLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [docId, guest])

  // Update transposition: optimistic UI + debounced save
  const updateTransposition = useCallback(
    (next: number) => {
      const clamped = Math.max(-12, Math.min(12, next))
      setTransposition(clamped)
      if (docId == null) return

      if (guest) {
        // Guests: write to sessionStorage only, no API call (the policy
        // blocks transposition.write for guests; this would 403 anyway).
        writeGuestTransposition(docId, clamped)
        return
      }

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        api(`/documents/${docId}/chord-preference`, {
          method: 'PUT',
          body: { transposition: clamped },
          silent: true,
        }).catch(() => {
          // Silent fail; user can retry by clicking again
        })
      }, 400)
    },
    [docId, guest],
  )

  // Cleanup pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  return { transposition, updateTransposition, loaded }
}
