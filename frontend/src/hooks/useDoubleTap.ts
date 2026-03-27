import { useRef, useCallback } from 'react'

/**
 * Returns an onClick handler that calls `onTap` on every tap,
 * and additionally calls `onDoubleTap` when two taps happen within 300ms.
 * Works reliably on iOS (no onDoubleClick needed).
 */
export function useDoubleTap(onTap: () => void, onDoubleTap: () => void) {
  const lastTap = useRef(0)

  return useCallback(() => {
    const now = Date.now()
    if (now - lastTap.current < 300) {
      onDoubleTap()
    }
    lastTap.current = now
    onTap()
  }, [onTap, onDoubleTap])
}
