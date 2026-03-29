import { useRef, useEffect } from 'react'
import { Repeat } from 'lucide-react'
import { formatTime } from '@/utils/formatters.ts'
import type { TimelineEntry } from '@/utils/buildTimeline'

interface SectionCardsProps {
  timeline: TimelineEntry[]
  currentTime: number
  activeSectionId: number | null
  loopEnabled: boolean
  loopStart: number | null
  loopEnd: number | null
  onSectionClick: (entry: TimelineEntry) => void
}

export function SectionCards({
  timeline, currentTime, activeSectionId,
  loopEnabled, loopStart, loopEnd, onSectionClick,
}: SectionCardsProps) {
  const activeRef = useRef<HTMLButtonElement>(null)
  const lastIndexRef = useRef(-1)

  const currentIndex = timeline.findIndex(
    (e) => currentTime >= e.start_time && currentTime < e.end_time,
  )

  useEffect(() => {
    if (currentIndex !== -1 && currentIndex !== lastIndexRef.current) {
      lastIndexRef.current = currentIndex
      activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentIndex])

  return (
    <div className="section-cards">
      {timeline.map((entry, i) => {
        const isCurrent = i === currentIndex
        const isLooping = isCurrent && loopEnabled
          && loopStart !== null && loopEnd !== null
          && ((!entry.isGap && entry.id === activeSectionId)
            || (entry.isGap
              && Math.abs(loopStart - entry.start_time) < 0.5
              && Math.abs(loopEnd - entry.end_time) < 0.5))

        let cls = 'section-card'
        if (isCurrent) cls += ' section-card--active'
        if (entry.isGap) cls += ' section-card--gap'

        return (
          <button
            key={entry.isGap ? `gap-${i}` : `sec-${entry.id}`}
            ref={isCurrent ? activeRef : undefined}
            className={cls}
            style={!entry.isGap ? { background: hexAlpha(entry.color!, 0.12) } : undefined}
            onClick={() => onSectionClick(entry)}
          >
            <span
              className={`section-card-dot ${entry.isGap ? 'section-card-dot--gap' : ''}`}
              style={!entry.isGap ? { background: entry.color! } : undefined}
            />
            <span className={`section-card-label ${entry.isGap ? 'section-card-label--gap' : ''}`}>
              {entry.isGap ? 'Luecke' : entry.label}
            </span>
            <span className="section-card-time">
              {formatTime(entry.start_time)} – {formatTime(entry.end_time)}
            </span>
            {isLooping && (
              <Repeat size={14} style={{ color: '#fbbf24', flexShrink: 0 }} />
            )}
          </button>
        )
      })}
    </div>
  )
}

function hexAlpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}
