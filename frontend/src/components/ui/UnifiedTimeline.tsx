import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { Minimize2, Maximize2 } from 'lucide-react'
import { Waveform } from '@/components/ui/Waveform'
import type { Marker } from '@/stores/playerStore'
import type { TimelineEntry } from '@/utils/buildTimeline'

type Zoom = 'fit' | 'detail'

/** ~7px per character at 11px bold + 12px padding */
const MIN_LABEL_WIDTH = 80
const CHAR_WIDTH = 7
const LABEL_PADDING = 16

interface UnifiedTimelineProps {
  peaks: number[]
  currentTime: number
  duration: number
  loopStart: number | null
  loopEnd: number | null
  loopEnabled: boolean
  markers: Marker[]
  timeline: TimelineEntry[]
  activeSectionId: number | null
  hasSections: boolean
  onSeek: (time: number) => void
  onSectionClick: (entry: TimelineEntry) => void
}

export function UnifiedTimeline({
  peaks, currentTime, duration, loopStart, loopEnd, loopEnabled,
  markers, timeline, activeSectionId, hasSections, onSeek, onSectionClick,
}: UnifiedTimelineProps) {
  const [zoom, setZoom] = useState<Zoom>('fit')
  const scrollRef = useRef<HTMLDivElement>(null)
  const didManualScroll = useRef(false)
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Calculate detail width so the smallest section label is fully readable
  const detailWidth = useMemo(() => {
    if (!hasSections || duration <= 0) return 800
    const labeled = timeline.filter(e => !e.isGap && e.label)
    if (labeled.length === 0) return 800
    // For each labeled section, calculate required strip width so its block fits the label
    const required = labeled.map(e => {
      const labelW = Math.max(MIN_LABEL_WIDTH, e.label!.length * CHAR_WIDTH + LABEL_PADDING)
      const durationFrac = (e.end_time - e.start_time) / duration
      return labelW / durationFrac
    })
    return Math.max(800, Math.ceil(Math.max(...required)))
  }, [timeline, duration, hasSections])

  const isScrollable = zoom === 'detail' && hasSections

  // Auto-scroll to playhead in detail mode
  useEffect(() => {
    if (!isScrollable || didManualScroll.current) return
    const el = scrollRef.current
    if (!el || duration <= 0) return
    const playX = (currentTime / duration) * detailWidth
    el.scrollLeft = Math.max(0, playX - el.clientWidth / 2)
  }, [currentTime, duration, isScrollable, detailWidth])

  const handleManualScroll = useCallback(() => {
    didManualScroll.current = true
    clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => { didManualScroll.current = false }, 3000)
  }, [])

  // Track touch start position to distinguish tap from scroll
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const handleSectionTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }, [])

  const handleSectionTap = useCallback((entry: TimelineEntry, e: React.TouchEvent) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) return
    const dx = Math.abs(e.changedTouches[0].clientX - start.x)
    const dy = Math.abs(e.changedTouches[0].clientY - start.y)
    // Only treat as tap if finger didn't move much
    if (dx < 10 && dy < 10) {
      e.preventDefault()
      onSectionClick(entry)
    }
  }, [onSectionClick])

  const playFrac = duration > 0 ? currentTime / duration : 0

  return (
    <div className="unified-timeline">
      {/* Zoom toggle */}
      {hasSections && (
        <div className="unified-zoom-row">
          <button
            className={`unified-zoom-btn ${zoom === 'fit' ? 'active' : ''}`}
            onClick={() => setZoom('fit')}
            title="Ganze Datei"
          >
            <Minimize2 size={14} />
          </button>
          <button
            className={`unified-zoom-btn ${zoom === 'detail' ? 'active' : ''}`}
            onClick={() => setZoom('detail')}
            title="Detail"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      )}

      {/* Scrollable container */}
      <div
        className={`unified-scroll ${isScrollable ? 'unified-scroll--scrollable' : ''}`}
        ref={scrollRef}
        onScroll={isScrollable ? handleManualScroll : undefined}
      >
        <div
          className="unified-strip"
          style={isScrollable ? { width: detailWidth } : undefined}
        >
          {/* Section lane (top zone — tap = loop) */}
          {hasSections && (
            <div className="unified-section-lane">
              {timeline.map((entry, i) => {
                const widthPct = ((entry.end_time - entry.start_time) / duration) * 100
                const isLooping = !entry.isGap && entry.id === activeSectionId
                const isGapLooping = entry.isGap && loopEnabled
                  && loopStart !== null && loopEnd !== null
                  && Math.abs(loopStart - entry.start_time) < 0.5
                  && Math.abs(loopEnd - entry.end_time) < 0.5

                return (
                  <button
                    key={entry.isGap ? `gap-${i}` : `sec-${entry.id}`}
                    className={
                      'unified-sec-block'
                      + (entry.isGap ? ' unified-sec-block--gap' : '')
                      + (isLooping || isGapLooping ? ' unified-sec-block--looping' : '')
                    }
                    style={{
                      width: `${widthPct}%`,
                      background: entry.isGap ? undefined : hexToRgba(entry.color!, 0.35),
                    }}
                    onClick={() => onSectionClick(entry)}
                    onTouchStart={handleSectionTouchStart}
                    onTouchEnd={(e) => handleSectionTap(entry, e)}
                  >
                    {!entry.isGap && (
                      <span className="unified-sec-label">{entry.label}</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Waveform (bottom zone — tap = seek) */}
          <Waveform
            peaks={peaks}
            currentTime={currentTime}
            duration={duration}
            loopStart={loopStart}
            loopEnd={loopEnd}
            loopEnabled={loopEnabled}
            markers={markers}
            activeSectionId={activeSectionId}
            onSeek={onSeek}
            dimmed={hasSections}
          />

          {/* Playhead line spanning both zones */}
          {duration > 0 && (
            <div
              className="unified-playhead"
              style={{ left: `${playFrac * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Scroll indicator */}
      {isScrollable && <ScrollIndicator scrollRef={scrollRef} />}
    </div>
  )
}

function ScrollIndicator({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const thumbRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    const thumb = thumbRef.current
    if (!el || !thumb) return
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el
      if (scrollWidth <= clientWidth) { thumb.style.display = 'none'; return }
      thumb.style.display = 'block'
      const ratio = clientWidth / scrollWidth
      const tw = Math.max(15, ratio * 100)
      const maxScroll = scrollWidth - clientWidth
      const leftPct = maxScroll > 0 ? (scrollLeft / maxScroll) * (100 - tw) : 0
      thumb.style.width = tw + '%'
      thumb.style.left = leftPct + '%'
    }
    el.addEventListener('scroll', update)
    update()
    return () => el.removeEventListener('scroll', update)
  }, [scrollRef])

  return (
    <div className="scroll-indicator">
      <div className="scroll-indicator-thumb" ref={thumbRef} />
    </div>
  )
}

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}
