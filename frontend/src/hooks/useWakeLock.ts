import { useEffect, useRef } from 'react'

/**
 * Haelt den Bildschirm an, solange `active` true ist.
 *
 * iOS Safari ab 16.4 und alle aktuellen Android-Browser unterstuetzen die
 * Screen Wake Lock API. Aeltere Browser ignorieren den Aufruf still.
 *
 * Wechsel des Tabs in den Hintergrund gibt den Lock automatisch frei — wir
 * holen ihn beim Zurueckkehren via `visibilitychange` neu.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null)

  useEffect(() => {
    if (!active) return
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return

    let cancelled = false

    const acquire = async () => {
      if (document.visibilityState !== 'visible') return
      if (sentinelRef.current) return
      try {
        const sentinel = await navigator.wakeLock.request('screen')
        if (cancelled) {
          sentinel.release().catch(() => {})
          return
        }
        sentinelRef.current = sentinel
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null
        })
      } catch {
        // Akku zu niedrig, Tab nicht sichtbar, etc. — ignorieren.
      }
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null
    }
  }, [active])
}
