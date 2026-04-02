import { useState, useEffect, useCallback, useRef } from 'react'
import { Maximize2, Minimize2, Plus, Minus } from 'lucide-react'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'

const FONT_SIZES = [12, 14, 16, 18, 22, 26, 32]
const DEFAULT_SIZE_INDEX = 2 // 16px

interface TextViewerProps {
  docId: number
  originalName: string
}

export function TextViewer({ docId, originalName }: TextViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sizeIndex, setSizeIndex] = useState(DEFAULT_SIZE_INDEX)
  const pdfFullscreen = usePlayerStore((s) => s.pdfFullscreen)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const [fabFaded, setFabFaded] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchContent() {
      try {
        const data = await api<{ content: string }>(`/documents/${docId}/content`)
        if (!cancelled) setContent(data.content)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Text konnte nicht geladen werden')
      }
    }
    fetchContent()
    return () => { cancelled = true }
  }, [docId])

  // Auto-fade FABs in fullscreen
  const resetFadeTimer = useCallback(() => {
    setFabFaded(false)
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    fadeTimerRef.current = setTimeout(() => setFabFaded(true), 3000)
  }, [])

  useEffect(() => {
    if (!pdfFullscreen) {
      setFabFaded(false)
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
      return
    }
    resetFadeTimer()
    return () => { if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current) }
  }, [pdfFullscreen, resetFadeTimer])

  const handleFullscreen = () => {
    usePlayerStore.getState().setPdfFullscreen(!pdfFullscreen)
  }

  const zoomIn = () => setSizeIndex((i) => Math.min(i + 1, FONT_SIZES.length - 1))
  const zoomOut = () => setSizeIndex((i) => Math.max(i - 1, 0))

  const progress = duration > 0 ? currentTime / duration : 0
  const circumference = 2 * Math.PI * 22
  const dashOffset = circumference * (1 - progress)

  const fabFadeClass = pdfFullscreen && fabFaded ? ' pdf-fab--faded' : ''

  if (error) {
    return (
      <div className="pdf-upload">
        <div className="pdf-upload-text" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      </div>
    )
  }

  if (content === null) {
    return (
      <div className="pdf-upload">
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Text laden...</span>
      </div>
    )
  }

  return (
    <div className="text-viewer" onTouchStart={pdfFullscreen ? resetFadeTimer : undefined}>
      {!pdfFullscreen && (
        <div className="text-viewer-name">{originalName}</div>
      )}
      <pre
        className="text-viewer-content"
        style={{ fontSize: FONT_SIZES[sizeIndex] }}
      >
        {content}
      </pre>

      {/* Zoom FABs — only in fullscreen */}
      {pdfFullscreen && (
        <div className={`text-zoom-fabs${fabFadeClass}`}>
          <button
            className="pdf-fab pdf-fab--small"
            onClick={zoomIn}
            onTouchStart={resetFadeTimer}
            disabled={sizeIndex === FONT_SIZES.length - 1}
            aria-label="Schrift groesser"
          >
            <Plus size={16} />
          </button>
          <button
            className="pdf-fab pdf-fab--small"
            onClick={zoomOut}
            onTouchStart={resetFadeTimer}
            disabled={sizeIndex === 0}
            aria-label="Schrift kleiner"
          >
            <Minus size={16} />
          </button>
        </div>
      )}

      {/* Fullscreen FAB */}
      <button
        className={`pdf-fab${pdfFullscreen ? ' pdf-fab--fullscreen' : ''}${fabFadeClass}`}
        onClick={handleFullscreen}
        onTouchStart={pdfFullscreen ? resetFadeTimer : undefined}
        aria-label={pdfFullscreen ? 'Fullscreen beenden' : 'Fullscreen'}
      >
        {pdfFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        {pdfFullscreen && (
          <svg className="pdf-fab-progress" viewBox="0 0 48 48">
            <circle className="pdf-fab-progress-track" cx="24" cy="24" r="22" />
            <circle
              className="pdf-fab-progress-fill"
              cx="24" cy="24" r="22"
              style={{ strokeDashoffset: dashOffset }}
            />
          </svg>
        )}
      </button>
    </div>
  )
}
