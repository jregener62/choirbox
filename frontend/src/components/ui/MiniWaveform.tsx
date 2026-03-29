import { useRef, useEffect, useCallback } from 'react'
import type { TimelineEntry } from '@/utils/buildTimeline'

interface MiniWaveformProps {
  peaks: number[]
  currentTime: number
  duration: number
  timeline?: TimelineEntry[]
  onSeek: (time: number) => void
}

const COLOR_PLAYED = 'rgba(129, 140, 248, 0.9)'
const COLOR_UNPLAYED = 'rgba(51, 65, 85, 0.8)'

export function MiniWaveform({ peaks, currentTime, duration, timeline, onSeek }: MiniWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stripRef = useRef<HTMLCanvasElement>(null)

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
    const gap = Math.max(0.5, barWidth * 0.2)
    const effectiveBarWidth = barWidth - gap
    const playX = duration > 0 ? (currentTime / duration) * w : 0

    for (let i = 0; i < barCount; i++) {
      const x = i * barWidth
      const barH = Math.max(1, peaks[i] * h * 0.9)
      ctx.fillStyle = (x + effectiveBarWidth < playX) ? COLOR_PLAYED : COLOR_UNPLAYED
      ctx.fillRect(x, h - barH, effectiveBarWidth, barH)
    }

    // Playhead line
    if (duration > 0) {
      ctx.fillStyle = '#f1f5f9'
      ctx.fillRect(playX - 1, 0, 2, h)
    }
  }, [peaks, currentTime, duration])

  // Draw section color strip
  const drawStrip = useCallback(() => {
    const canvas = stripRef.current
    if (!canvas || !timeline || timeline.length === 0 || duration <= 0) return
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

    for (const entry of timeline) {
      if (entry.isGap) continue
      const x = (entry.start_time / duration) * w
      const entryW = ((entry.end_time - entry.start_time) / duration) * w
      ctx.fillStyle = entry.color || '#334155'
      ctx.fillRect(x, 0, entryW, h)
    }
  }, [timeline, duration])

  useEffect(() => {
    let raf: number
    const loop = () => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [draw])

  useEffect(() => { drawStrip() }, [drawStrip])

  const handleSeek = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas || duration <= 0) return
    e.stopPropagation()
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onSeek(frac * duration)
  }, [duration, onSeek])

  return (
    <div className="mini-waveform">
      <canvas
        ref={canvasRef}
        className="mini-waveform-canvas"
        onClick={handleSeek}
      />
      {timeline && timeline.length > 0 && (
        <canvas ref={stripRef} className="mini-waveform-strip" />
      )}
    </div>
  )
}
