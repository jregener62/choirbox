import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api/client.ts'

/**
 * Manage per-user transposition preference for a .cho document.
 *
 * - Loads the saved transposition on mount.
 * - Returns optimistic local state + a setter that auto-saves with a debounce.
 * - Cancels in-flight saves on doc change / unmount.
 */
export function useChordPreference(docId: number | null | undefined) {
  const [transposition, setTransposition] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load preference whenever the document changes
  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    setLoaded(false)
    setTransposition(0)
    if (docId == null) return
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
  }, [docId])

  // Update transposition: optimistic UI + debounced save
  const updateTransposition = useCallback(
    (next: number) => {
      const clamped = Math.max(-12, Math.min(12, next))
      setTransposition(clamped)
      if (docId == null) return
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
    [docId],
  )

  // Cleanup pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  return { transposition, updateTransposition, loaded }
}
