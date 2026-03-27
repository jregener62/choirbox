import { useRef, useEffect } from 'react'
import type { TimelineEntry } from '@/utils/buildTimeline'
import { formatTime } from '@/utils/formatters'

interface SectionStripProps {
  timeline: TimelineEntry[]
  duration: number
  currentTime: number
  activeSectionId: number | null
  onEntryClick: (entry: TimelineEntry) => void
  stripWidth: number
}

export function SectionStrip({
  timeline, duration, currentTime, activeSectionId, onEntryClick, stripWidth,
}: SectionStripProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const didManualScroll = useRef(false)
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Auto-scroll to current playback position
  useEffect(() => {
    if (didManualScroll.current) return
    const el = scrollRef.current
    if (!el || duration <= 0) return
    const playX = (currentTime / duration) * stripWidth
    const target = Math.max(0, playX - el.clientWidth / 2)
    el.scrollLeft = target
  }, [currentTime, duration, stripWidth])

  // Detect manual scroll and pause auto-scroll briefly
  const handleScroll = () => {
    didManualScroll.current = true
    clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => { didManualScroll.current = false }, 3000)
  }

  if (timeline.length === 0 || duration <= 0) return null

  return (
    <div className="section-strip-scroll" ref={scrollRef} onScroll={handleScroll}>
      <div className="section-strip-inner" style={{ width: stripWidth }}>
        {timeline.map((entry, i) => {
          const widthPx = ((entry.end_time - entry.start_time) / duration) * stripWidth
          const isActive = !entry.isGap && entry.id === activeSectionId
          const isCurrent = currentTime >= entry.start_time && currentTime < entry.end_time
          const progress = isCurrent ? (currentTime - entry.start_time) / (entry.end_time - entry.start_time) : 0

          return (
            <button
              key={entry.isGap ? `gap-${i}` : `sec-${entry.id}`}
              className={
                'section-strip-block'
                + (entry.isGap ? ' section-strip-block--gap' : '')
                + (isActive ? ' section-strip-block--looping' : '')
                + (isCurrent ? ' section-strip-block--current' : '')
              }
              style={{
                width: widthPx,
                background: entry.isGap ? 'none' : (
                  isCurrent
                    ? hexToRgba(entry.color!, 0.4)
                    : hexToRgba(entry.color!, 0.2)
                ),
              }}
              onClick={() => onEntryClick(entry)}
            >
              {isCurrent && (
                <div className="section-strip-progress" style={{ width: `${progress * 100}%` }} />
              )}
              {isCurrent && (
                <div className="section-strip-playing"><span /><span /><span /></div>
              )}
              <span className="section-strip-label">
                {entry.isGap
                  ? `${formatTime(entry.start_time)} – ${formatTime(entry.end_time)}`
                  : entry.label}
              </span>
              <span className="section-strip-time">
                {entry.isGap ? '' : `${formatTime(entry.start_time)} – ${formatTime(entry.end_time)}`}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}
