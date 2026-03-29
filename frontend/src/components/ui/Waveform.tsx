import { useRef, useEffect, useCallback } from 'react'
import type { Marker } from '@/stores/playerStore.ts'

interface WaveformProps {
  peaks: number[]
  currentTime: number
  duration: number
  loopStart: number | null
  loopEnd: number | null
  loopEnabled: boolean
  markers: Marker[]
  activeSectionId?: number | null
  onSeek: (time: number) => void
  /** Dim bars when sections provide the primary orientation */
  dimmed?: boolean
}

const COLOR_UNPLAYED = 'rgba(148, 163, 184, 0.3)'
const COLOR_UNPLAYED_DIM = 'rgba(148, 163, 184, 0.12)'
const COLOR_LOOP = '#f59e0b'
const COLOR_LOOP_DIM = 'rgba(245, 158, 11, 0.6)'
const COLOR_MARKER = '#fbbf24'

export function Waveform({
  peaks, currentTime, duration,
  loopStart, loopEnd, loopEnabled,
  markers, activeSectionId = null,
  onSeek, dimmed = false,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

    const barCount = peaks.length
    const barWidth = w / barCount
    const gap = Math.max(1, barWidth * 0.2)
    const effectiveBarWidth = barWidth - gap
    const loopStartFrac = loopStart !== null && duration > 0 ? loopStart / duration : null
    const loopEndFrac = loopEnd !== null && duration > 0 ? loopEnd / duration : null
    const hasLoop = loopStartFrac !== null && loopEndFrac !== null

    for (let i = 0; i < barCount; i++) {
      const x = i * barWidth
      const frac = (i + 0.5) / barCount
      const peakHeight = Math.max(2, peaks[i] * h * 0.85)
      const y = (h - peakHeight) / 2
      const isInLoop = hasLoop && loopEnabled && frac >= loopStartFrac && frac <= loopEndFrac

      if (isInLoop) {
        ctx.fillStyle = dimmed ? COLOR_LOOP_DIM : COLOR_LOOP
      } else {
        ctx.fillStyle = dimmed ? COLOR_UNPLAYED_DIM : COLOR_UNPLAYED
      }

      const radius = Math.min(effectiveBarWidth / 2, 2)
      roundedRect(ctx, x + gap / 2, y, effectiveBarWidth, peakHeight, radius)
    }

    // Markers
    for (const marker of markers) {
      const mx = (duration > 0 ? marker.time / duration : 0) * w
      ctx.fillStyle = COLOR_MARKER
      ctx.beginPath()
      ctx.arc(mx, h - 6, 4, 0, Math.PI * 2)
      ctx.fill()
    }

    // A/B labels (only for manual loop, not section loop)
    if (!activeSectionId) {
      if (loopStartFrac !== null) {
        ctx.fillStyle = COLOR_LOOP
        ctx.font = 'bold 10px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('A', loopStartFrac * w, 10)
      }
      if (loopEndFrac !== null) {
        ctx.fillStyle = COLOR_LOOP
        ctx.font = 'bold 10px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText('B', loopEndFrac * w, 10)
      }
    }
  }, [peaks, duration, loopStart, loopEnd, loopEnabled, markers, dimmed, activeSectionId])

  useEffect(() => {
    draw()
  }, [draw])

  const seekFromEvent = (clientX: number) => {
    const canvas = canvasRef.current
    if (!canvas || duration <= 0) return
    const rect = canvas.getBoundingClientRect()
    const frac = (clientX - rect.left) / rect.width
    onSeek(Math.max(0, Math.min(duration, frac * duration)))
  }

  if (peaks.length === 0) {
    return (
      <div className="waveform-placeholder">
        <div className="waveform-loading">Waveform laden...</div>
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className="waveform-canvas"
      onClick={(e) => seekFromEvent(e.clientX)}
    />
  )
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
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
