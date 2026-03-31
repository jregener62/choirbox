import { useRef, useCallback } from 'react'

interface DotBarProps {
  count: number
  activeIndex: number
  onDotClick: (index: number) => void
  className?: string
}

export function DotBar({ count, activeIndex, onDotClick, className }: DotBarProps) {
  const touchStartX = useRef(0)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX
    }
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.changedTouches.length !== 1) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (Math.abs(dx) > 40) {
      if (dx < 0 && activeIndex < count - 1) onDotClick(activeIndex + 1)
      if (dx > 0 && activeIndex > 0) onDotClick(activeIndex - 1)
    }
  }, [activeIndex, count, onDotClick])

  return (
    <div
      className={`dot-bar${className ? ' ' + className : ''}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          className={`dot${i === activeIndex ? ' dot--active' : ''}`}
          onClick={() => onDotClick(i)}
        />
      ))}
    </div>
  )
}
