import { useRef, useState, useCallback, useEffect } from 'react'
import { Download, Upload, Maximize2, Minimize2, PenLine, FileText, Video, File, Plus, Minus } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useDocumentsStore } from '@/hooks/useDocuments.ts'
import { useAnnotationStore } from '@/hooks/useAnnotations.ts'
import { AnnotatedPage } from '@/components/ui/AnnotatedPage.tsx'
import { AnnotationToolbar } from '@/components/ui/AnnotationToolbar.tsx'
import { VideoViewer } from '@/components/ui/VideoViewer.tsx'
import { TextViewer } from '@/components/ui/TextViewer.tsx'
import type { DocumentItem } from '@/types/index.ts'

interface DocumentPanelProps {
  folderPath: string
  canUpload?: boolean
  /** If provided, show only this document (player mode). Otherwise use documents store. */
  document?: DocumentItem | null
  /** Show hint when no document is selected (player mode) */
  emptyHint?: string
}

function getDocIcon(type: string, size = 14) {
  if (type === 'pdf') return <FileText size={size} />
  if (type === 'video') return <Video size={size} />
  return <File size={size} />
}

function getDistance(t1: Touch, t2: Touch) {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}


export function DocumentPanel({ folderPath, canUpload = false, document: externalDoc, emptyHint }: DocumentPanelProps) {
  const token = useAuthStore((s) => s.token)
  const { documents, activeDocId, loading, uploading, upload } = useDocumentsStore()
  const pdfFullscreen = usePlayerStore((s) => s.pdfFullscreen)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const drawingMode = useAnnotationStore((s) => s.drawingMode)
  const setDrawingMode = useAnnotationStore((s) => s.setDrawingMode)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [fabFaded, setFabFaded] = useState(false)
  const [textSizeIndex, setTextSizeIndex] = useState(2)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinchRef = useRef({ startDist: 0, startScale: 1 })

  const TEXT_FONT_SIZES = [12, 14, 16, 18, 22, 26, 32]

  // If external document is provided (player mode), use it; otherwise use store
  const isPlayerMode = externalDoc !== undefined
  const activeDoc = isPlayerMode ? (externalDoc ?? null) : (documents.find((d) => d.id === activeDocId) ?? null)

  // Flush annotations on unmount
  useEffect(() => {
    return () => { useAnnotationStore.getState().flushAll() }
  }, [])

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

  // Pinch-to-zoom — re-attach when document changes
  useEffect(() => {
    const el = pagesRef.current
    if (!el) return

    setScale(1)
    let currentScale = 1

    function onTouchStart(e: TouchEvent) {
      if (useAnnotationStore.getState().drawingMode) return
      if (e.touches.length === 2) {
        e.preventDefault()
        pinchRef.current.startDist = getDistance(e.touches[0], e.touches[1])
        pinchRef.current.startScale = currentScale
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (useAnnotationStore.getState().drawingMode) return
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
  }, [activeDoc?.id])

  // Double-tap to toggle zoom
  const lastTapRef = useRef(0)
  const handleDoubleTap = useCallback((e: React.TouchEvent) => {
    if (drawingMode) return
    if (e.touches.length !== 1) return
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      e.preventDefault()
      setScale((s) => s > 1.1 ? 1 : 2.5)
    }
    lastTapRef.current = now
  }, [drawingMode])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await upload(folderPath, file)
    } catch {
      // Error handled by store
    }
    e.target.value = ''
  }

  if (!isPlayerMode && loading) {
    return (
      <div className="pdf-upload">
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Laden...</span>
      </div>
    )
  }

  // Player mode: no selected document
  if (isPlayerMode && !activeDoc) {
    return emptyHint ? (
      <div className="pdf-upload">
        <div className="pdf-upload-icon">
          <FileText size={24} />
        </div>
        <div className="pdf-upload-text">{emptyHint}</div>
      </div>
    ) : null
  }

  // DocViewer mode: no documents at all
  if (!isPlayerMode && documents.length === 0) {
    if (!canUpload) return null
    return (
      <div className="pdf-upload">
        <div className="pdf-upload-icon">
          <FileText size={24} />
        </div>
        <div className="pdf-upload-text">
          Noch keine Dokumente in diesem Ordner.
        </div>
        <button
          className="pdf-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <Upload size={14} />
          {uploading ? 'Wird hochgeladen...' : 'Dokument hochladen'}
        </button>
        <span className="pdf-upload-hint">PDF, Video (MP4/WebM/MOV) oder TXT</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>
    )
  }

  if (!activeDoc) return null

  const isPdf = activeDoc.file_type === 'pdf'
  const isTxt = activeDoc.file_type === 'txt'
  const pdfUrl = `/api/documents/${activeDoc.id}/download?token=${token}`

  return (
    <div className="pdf-panel">
      {/* Toolbar (PDF only) */}
      {isPdf && (
        <div className="pdf-toolbar">
          <span className="pdf-toolbar-name">
            {activeDoc.original_name}
            {activeDoc.page_count > 1 && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({activeDoc.page_count} S.)</span>
            )}
          </span>
          <div className="pdf-toolbar-actions">
            <a href={pdfUrl} download={activeDoc.original_name} className="pdf-toolbar-btn" title="Download">
              <Download size={16} />
            </a>
          </div>
        </div>
      )}

      {/* Non-PDF toolbar */}
      {!isPdf && (
        <div className="pdf-toolbar">
          <span className="pdf-toolbar-name">
            {getDocIcon(activeDoc.file_type)} {activeDoc.original_name}
          </span>
        </div>
      )}

      {isPdf && drawingMode && (
        <AnnotationToolbar pageKey={`${activeDoc.id}::1`} />
      )}

      {/* Content area */}
      {activeDoc.file_type === 'pdf' && (
        <div
          ref={pagesRef}
          className={`pdf-pages${drawingMode ? ' pdf-pages--drawing' : ''}`}
          onTouchStart={(e) => { handleDoubleTap(e); handlePdfAreaTouch() }}
        >
          {Array.from({ length: activeDoc.page_count }, (_, i) => i + 1).map((page) => (
            <AnnotatedPage
              key={`${activeDoc.id}-${page}`}
              page={page}
              scale={scale}
              src={`/api/documents/${activeDoc.id}/page/${page}?token=${token}`}
              alt={`Seite ${page}`}
              loading={page > 2 ? 'lazy' : 'eager'}
              docId={activeDoc.id}
            />
          ))}
        </div>
      )}

      {activeDoc.file_type === 'video' && (
        <VideoViewer docId={activeDoc.id} originalName={activeDoc.original_name} />
      )}

      {activeDoc.file_type === 'txt' && (
        <TextViewer
          docId={activeDoc.id}
          originalName={activeDoc.original_name}
          fontSize={TEXT_FONT_SIZES[textSizeIndex]}
          showName={!pdfFullscreen}
        />
      )}

      {/* FABs — PDF: Draw + Fullscreen, TXT: Zoom + Fullscreen */}
      {isPdf && (
        <button
          className={`pdf-fab pdf-fab--draw${drawingMode ? ' pdf-fab--draw-active' : ''}${pdfFullscreen && fabFaded ? ' pdf-fab--faded' : ''}`}
          onClick={() => setDrawingMode(!drawingMode)}
          onTouchStart={pdfFullscreen ? resetFadeTimer : undefined}
          aria-label={drawingMode ? 'Zeichenmodus beenden' : 'Zeichnen'}
        >
          <PenLine size={18} />
        </button>
      )}
      {isTxt && pdfFullscreen && (
        <>
          <button
            className={`pdf-fab pdf-fab--small pdf-fab--zoom-in${pdfFullscreen && fabFaded ? ' pdf-fab--faded' : ''}`}
            onClick={() => { setTextSizeIndex((i) => Math.min(i + 1, TEXT_FONT_SIZES.length - 1)); resetFadeTimer() }}
            disabled={textSizeIndex === TEXT_FONT_SIZES.length - 1}
            aria-label="Schrift groesser"
          >
            <Plus size={16} />
          </button>
          <button
            className={`pdf-fab pdf-fab--small pdf-fab--zoom-out${pdfFullscreen && fabFaded ? ' pdf-fab--faded' : ''}`}
            onClick={() => { setTextSizeIndex((i) => Math.max(i - 1, 0)); resetFadeTimer() }}
            disabled={textSizeIndex === 0}
            aria-label="Schrift kleiner"
          >
            <Minus size={16} />
          </button>
        </>
      )}
      {(isPdf || isTxt) && (
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
      )}

      {canUpload && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      )}
    </div>
  )
}
