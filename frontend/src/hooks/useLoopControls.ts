import { useRef, useCallback } from 'react'
import { usePlayerStore } from '@/stores/playerStore.ts'

export function useLoopControls() {
  const currentTime = usePlayerStore((s) => s.currentTime)

  const addMarker = () => usePlayerStore.getState().addMarker(currentTime)

  const loopTapTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const loopLastTap = useRef(0)
  const handleLoopTap = useCallback(() => {
    const now = Date.now()
    if (now - loopLastTap.current < 300) {
      clearTimeout(loopTapTimer.current)
      usePlayerStore.getState().clearLoop()
    } else {
      loopTapTimer.current = setTimeout(() => {
        usePlayerStore.getState().toggleLoop()
      }, 300)
    }
    loopLastTap.current = now
  }, [])

  return { addMarker, handleLoopTap }
}
