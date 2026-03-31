import { Download, Upload, Trash2, Maximize2, Minimize2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { usePdfStore } from '@/hooks/usePdf.ts'
import { useRef, useState, useCallback, useEffect } from 'react'
import type { PdfInfo } from '@/types/index.ts'

interface PdfViewerProps {
  dropboxPath: string
  info: PdfInfo
  canUpload: boolean
}

function getDistance(t1: Touch, t2: Touch) {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}


export function PdfViewer({ dropboxPath, info, canUpload }: PdfViewerProps) {
  const token = useAuthStore((s) => s.token)
  const { upload, remove } = usePdfStore()
  const pdfFullscreen = usePlayerStore((s) => s.pdfFullscreen)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [scale, setScale] = useState(1)
  const [fabFaded, setFabFaded] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinchRef = useRef({ startDist: 0, startScale: 1 })
  const pdfUrl = `/api/pdf/download?path=${encodeURIComponent(dropboxPath)}&token=${token}`

  // Auto-fade FAB after 3s in fullscreen
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

  const handleFabClick = () => {
    usePlayerStore.getState().setPdfFullscreen(!pdfFullscreen)
  }

  const handlePdfAreaTouch = useCallback(() => {
    if (pdfFullscreen) resetFadeTimer()
  }, [pdfFullscreen, resetFadeTimer])

  const progress = duration > 0 ? currentTime / duration : 0
  const circumference = 2 * Math.PI * 22
  const dashOffset = circumference * (1 - progress)

  // Pinch-to-zoom via touch events
  useEffect(() => {
    const el = pagesRef.current
    if (!el) return

    let currentScale = 1

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault()
        pinchRef.current.startDist = getDistance(e.touches[0], e.touches[1])
        pinchRef.current.startScale = currentScale
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (e.touches.length === 2) {
        e.preventDefault()
        const dist = getDistance(e.touches[0], e.touches[1])
        const newScale = Math.max(1, Math.min(5, pinchRef.current.startScale * (dist / pinchRef.current.startDist)))
        currentScale = newScale
        setScale(newScale)
      }
    }

    function onTouchEnd() {
      if (currentScale < 1.05) {
        currentScale = 1
        setScale(1)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // Double-tap to toggle zoom
  const lastTapRef = useRef(0)
  const handleDoubleTap = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      e.preventDefault()
      setScale((s) => s > 1.1 ? 1 : 2.5)
    }
    lastTapRef.current = now
  }, [])

  const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await upload(dropboxPath, file)
    } catch {
      // Error handled by store
    }
    e.target.value = ''
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await remove(dropboxPath)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const pages = Array.from({ length: info.page_count }, (_, i) => i + 1)

  return (
    <div className="pdf-panel">
      <div className="pdf-toolbar">
        <span className="pdf-toolbar-name">
          {info.original_name}
          {info.page_count > 1 && (
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({info.page_count} S.)</span>
          )}
        </span>
        <div className="pdf-toolbar-actions">
          {canUpload && (
            <>
              <button className="pdf-toolbar-btn" onClick={() => fileInputRef.current?.click()} title="PDF ersetzen">
                <Upload size={16} />
              </button>
              <button className="pdf-toolbar-btn" onClick={() => setConfirmDelete(true)} title="PDF loeschen" style={{ color: 'var(--danger)' }}>
                <Trash2 size={16} />
              </button>
            </>
          )}
          <a href={pdfUrl} download={info.original_name ?? 'document.pdf'} className="pdf-toolbar-btn" title="Download">
            <Download size={16} />
          </a>
        </div>
      </div>
      <div
        ref={pagesRef}
        className="pdf-pages"
        onTouchStart={(e) => { handleDoubleTap(e); handlePdfAreaTouch() }}
      >
        {pages.map((page) => (
          <img
            key={page}
            className="pdf-page-img"
            style={{ width: `${scale * 100}%` }}
            src={`/api/pdf/page/${page}?path=${encodeURIComponent(dropboxPath)}&token=${token}`}
            alt={`Seite ${page}`}
            loading={page > 2 ? 'lazy' : 'eager'}
            draggable={false}
          />
        ))}
      </div>
      <button
        className={`pdf-fab${pdfFullscreen ? ' pdf-fab--fullscreen' : ''}${pdfFullscreen && fabFaded ? ' pdf-fab--faded' : ''}`}
        onClick={handleFabClick}
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
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={handleReplace}
      />
      {confirmDelete && (
        <div className="confirm-overlay" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title">PDF loeschen?</p>
            <p className="confirm-filename">{info.original_name}</p>
            <p className="confirm-hint">Wird unwiderruflich aus der Dropbox geloescht.</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Abbrechen
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Loeschen...' : 'Loeschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
