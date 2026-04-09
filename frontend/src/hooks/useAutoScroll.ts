import { useEffect, useRef } from 'react'

/**
 * Kontinuierliches Auto-Scrolling fuer einen scrollbaren Container.
 *
 * @param containerRef Ref auf das Element, das gescrollt werden soll (overflow: auto/scroll)
 * @param enabled       wenn false, laeuft kein RAF-Loop
 * @param pxPerSec      Scroll-Geschwindigkeit in Pixeln pro Sekunde
 * @param onReachEnd    optional, wird genau einmal beim Erreichen des Dokument-Endes aufgerufen
 */
export function useAutoScroll(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
  pxPerSec: number,
  onReachEnd?: () => void,
) {
  const onReachEndRef = useRef(onReachEnd)
  onReachEndRef.current = onReachEnd

  useEffect(() => {
    if (!enabled) return
    const el = containerRef.current
    if (!el) return

    let rafId: number | null = null
    let lastTime = 0
    let accum = 0
    let cancelled = false
    let endReported = false

    const step = (now: number) => {
      if (cancelled) return
      if (lastTime === 0) {
        lastTime = now
        rafId = requestAnimationFrame(step)
        return
      }
      const dt = (now - lastTime) / 1000
      lastTime = now
      accum += pxPerSec * dt
      const intPx = Math.floor(accum)
      if (intPx > 0) {
        accum -= intPx
        el.scrollTop += intPx
      }
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      if (atEnd && !endReported) {
        endReported = true
        if (onReachEndRef.current) onReachEndRef.current()
        return
      }
      rafId = requestAnimationFrame(step)
    }

    rafId = requestAnimationFrame(step)

    return () => {
      cancelled = true
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [containerRef, enabled, pxPerSec])
}
