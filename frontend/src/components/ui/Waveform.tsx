import { useRef, useEffect, useCallback } from 'react'
import type { Marker } from '@/stores/playerStore.ts'
import type { TimelineEntry } from '@/utils/buildTimeline'

interface WaveformProps {
  peaks: number[]
  currentTime: number
  duration: number
  loopStart: number | null
  loopEnd: number | null
  loopEnabled: boolean
  markers: Marker[]
  timeline?: TimelineEntry[]
  activeSectionId?: number | null
  onSeek: (time: number) => void
  /** If set, canvas is this wide (px) inside a scrollable container */
  stripWidth?: number
}

// Colors
const COLOR_UNPLAYED = 'rgba(148, 163, 184, 0.3)'
const COLOR_PLAYED = '#818cf8'
const COLOR_LOOP = '#f59e0b'
const COLOR_LOOP_UNPLAYED = 'rgba(245, 158, 11, 0.35)'
const COLOR_MARKER = '#fbbf24'

export function Waveform({
  peaks,
  currentTime,
  duration,
  loopStart,
  loopEnd,
  loopEnabled,
  markers,
  timeline = [],
  activeSectionId = null,
  onSeek,
  stripWidth,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const didManualScroll = useRef(false)
  const scrollTimer = useRef<ReturnType<typeof setTimeout>>()

  const isScrollable = !!stripWidth

  // Auto-scroll to playhead
  useEffect(() => {
    if (!isScrollable || didManualScroll.current) return
    const el = scrollRef.current
    if (!el || duration <= 0) return
    const playX = (currentTime / duration) * stripWidth!
    const target = Math.max(0, playX - el.clientWidth / 2)
    el.scrollLeft = target
  }, [currentTime, duration, stripWidth, isScrollable])

  const handleManualScroll = () => {
    didManualScroll.current = true
    clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => { didManualScroll.current = false }, 3000)
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || peaks.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, w, h)

    // Draw timeline overlays (sections + gaps)
    if (duration > 0 && timeline.length > 0) {
      for (const entry of timeline) {
        const x1 = (entry.start_time / duration) * w
        const x2 = (entry.end_time / duration) * w
        const entryW = x2 - x1
        const isActive = !entry.isGap && entry.id === activeSectionId

        if (entry.isGap) {
          // Dashed border for gaps
          ctx.strokeStyle = 'rgba(148,163,184,0.2)'
          ctx.lineWidth = 1
          ctx.setLineDash([4, 3])
          ctx.strokeRect(x1 + 0.5, 0.5, entryW - 1, h - 1)
          ctx.setLineDash([])

          // Gap time label
          ctx.fillStyle = 'rgba(148,163,184,0.35)'
          ctx.font = '500 8px system-ui'
          ctx.textAlign = 'left'
          if (entryW > 40) {
            ctx.fillText(fmtTime(entry.start_time), x1 + 3, 10)
          }
        } else {
          // Background tint
          ctx.fillStyle = hexToRgba(entry.color!, isActive ? 0.18 : 0.08)
          ctx.fillRect(x1, 0, entryW, h)

          // Boundary line
          ctx.strokeStyle = 'rgba(255,255,255,0.12)'
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(x1, 0)
          ctx.lineTo(x1, h)
          ctx.stroke()

          // Label
          ctx.fillStyle = isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)'
          ctx.font = 'bold 9px system-ui'
          ctx.textAlign = 'left'
          ctx.fillText(entry.label!, x1 + 3, 10)
        }
      }
    }

    const barCount = peaks.length
    const barWidth = w / barCount
    const gap = Math.max(1, barWidth * 0.2)
    const effectiveBarWidth = barWidth - gap
    const playProgress = duration > 0 ? currentTime / duration : 0

    const loopStartFrac = loopStart !== null && duration > 0 ? loopStart / duration : null
    const loopEndFrac = loopEnd !== null && duration > 0 ? loopEnd / duration : null
    const hasLoop = loopStartFrac !== null && loopEndFrac !== null

    // Draw bars
    for (let i = 0; i < barCount; i++) {
      const x = i * barWidth
      const frac = (i + 0.5) / barCount
      const peakHeight = Math.max(2, peaks[i] * h * 0.85)
      const y = (h - peakHeight) / 2

      const isPlayed = frac <= playProgress
      const isInLoop = hasLoop && frac >= loopStartFrac && frac <= loopEndFrac

      if (isInLoop && loopEnabled) {
        ctx.fillStyle = isPlayed ? COLOR_LOOP : COLOR_LOOP_UNPLAYED
      } else if (isInLoop && !loopEnabled) {
        ctx.fillStyle = isPlayed ? COLOR_PLAYED : COLOR_LOOP_UNPLAYED
      } else {
        ctx.fillStyle = isPlayed ? COLOR_PLAYED : COLOR_UNPLAYED
      }

      const radius = Math.min(effectiveBarWidth / 2, 2)
      roundedRect(ctx, x + gap / 2, y, effectiveBarWidth, peakHeight, radius)
    }

    // Playhead (only in scrollable mode)
    if (isScrollable && duration > 0) {
      const px = playProgress * w
      ctx.fillStyle = '#fff'
      ctx.fillRect(px - 1, 0, 2, h)
    }

    // Draw markers
    for (const marker of markers) {
      const markerFrac = duration > 0 ? marker.time / duration : 0
      const mx = markerFrac * w
      ctx.fillStyle = COLOR_MARKER
      ctx.beginPath()
      ctx.arc(mx, h - 6, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // Draw A/B labels
    if (loopStartFrac !== null) {
      const ax = loopStartFrac * w
      ctx.fillStyle = COLOR_LOOP
      ctx.font = 'bold 10px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('A', ax, 10)
    }
    if (loopEndFrac !== null) {
      const bx = loopEndFrac * w
      ctx.fillStyle = COLOR_LOOP
      ctx.font = 'bold 10px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('B', bx, 10)
    }
  }, [peaks, currentTime, duration, loopStart, loopEnd, loopEnabled, markers, timeline, activeSectionId, isScrollable])

  useEffect(() => {
    let raf: number
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  const seekFromEvent = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas || duration <= 0) return
    const rect = canvas.getBoundingClientRect()
    const frac = (clientX - rect.left) / rect.width
    onSeek(Math.max(0, Math.min(duration, frac * duration)))
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => seekFromEvent(e.clientX)
  const handleTouch = (e: React.TouchEvent<HTMLCanvasElement>) => seekFromEvent(e.touches[0].clientX)

  if (peaks.length === 0) {
    return (
      <div className="waveform-placeholder">
        <div className="waveform-loading">Waveform laden...</div>
      </div>
    )
  }

  const canvasEl = (
    <canvas
      ref={canvasRef}
      className="waveform-canvas"
      style={isScrollable ? { width: stripWidth, minWidth: stripWidth } : undefined}
      onClick={handleClick}
      onTouchStart={handleTouch}
    />
  )

  if (isScrollable) {
    return (
      <div className="waveform-scroll" ref={scrollRef} onScroll={handleManualScroll}>
        {canvasEl}
      </div>
    )
  }

  return canvasEl
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function fmtTime(s: number): string {
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0')
}
