import { useRef, useState, useCallback, useEffect } from 'react'
import { Download, Upload, Maximize2, Minimize2, PenLine, FileText, Video, File, Plus, Minus, Music } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import { isGuest } from '@/utils/roles.ts'
import { usePlayerStore, AUTO_SCROLL_SPEEDS, AUTO_SCROLL_BASE_PX_PER_SEC } from '@/stores/playerStore.ts'
import { useDocumentsStore } from '@/hooks/useDocuments.ts'
import { useAnnotationStore } from '@/hooks/useAnnotations.ts'
import { useChordPreference } from '@/hooks/useChordPreference.ts'
import { useAutoScroll } from '@/hooks/useAutoScroll.ts'
import { AnnotatedPage } from '@/components/ui/AnnotatedPage.tsx'
import { AnnotationToolbar } from '@/components/ui/AnnotationToolbar.tsx'
import { VideoViewer } from '@/components/ui/VideoViewer.tsx'
import { TextViewer } from '@/components/ui/TextViewer.tsx'
import { ChordSheetTextViewer } from '@/components/ui/ChordSheetTextViewer.tsx'
import { AutoScrollStepper } from '@/components/ui/AutoScrollStepper.tsx'
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
  if (type === 'cho') return <Music size={size} />
  return <File size={size} />
}

function TransposeButtons({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <>
      <button
        className="transpose-stepper-btn"
        onClick={() => onChange(value - 1)}
        disabled={value <= -12}
        aria-label="Transponieren -1"
      >
        <Minus size={16} />
      </button>
      <span className="transpose-stepper-value">
        {value > 0 ? `+${value}` : value}
      </span>
      <button
        className="transpose-stepper-btn"
        onClick={() => onChange(value + 1)}
        disabled={value >= 12}
        aria-label="Transponieren +1"
      >
        <Plus size={16} />
      </button>
    </>
  )
}

function getDistance(t1: Touch, t2: Touch) {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}


export function DocumentPanel({ folderPath, canUpload = false, document: externalDoc, emptyHint }: DocumentPanelProps) {
  const token = useAuthStore((s) => s.token)
  const userRole = useAuthStore((s) => s.user?.role)
  const guest = isGuest(userRole)
  const { documents, activeDocId, loading, uploading, upload } = useDocumentsStore()
  const pdfFullscreen = usePlayerStore((s) => s.pdfFullscreen)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentPath = usePlayerStore((s) => s.currentPath)
  const autoScrollEnabled = usePlayerStore((s) => s.autoScrollEnabled)
  const autoScrollSpeedIdx = usePlayerStore((s) => s.autoScrollSpeedIdx)
  const setAutoScrollEnabled = usePlayerStore((s) => s.setAutoScrollEnabled)
  const drawingMode = useAnnotationStore((s) => s.drawingMode)
  const setDrawingMode = useAnnotationStore((s) => s.setDrawingMode)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const scrollTargetRef = useRef<HTMLElement | null>(null)
  const [scale, setScale] = useState(1)
  const [fabFaded, setFabFaded] = useState(false)
  const [textSizeIndex, setTextSizeIndex] = useState(2)
  const [showSwipeHint, setShowSwipeHint] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinchRef = useRef({ startDist: 0, startScale: 1 })

  // Landscape detection for iOS Safari body-scroll workaround
  const [isLandscape, setIsLandscape] = useState(
    () => window.matchMedia('(orientation: landscape)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)')
    const handler = (e: MediaQueryListEvent) => setIsLandscape(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Body-scroll fullscreen: iOS Safari hides chrome only on body scroll.
  // In landscape + fullscreen, switch from fixed overlay to body-scroll layout.
  const canFullscreen = typeof document.fullscreenEnabled === 'boolean'
    ? document.fullscreenEnabled
    : !!(document as any).webkitFullscreenEnabled
  const bodyScrollFs = pdfFullscreen && isLandscape && !canFullscreen

  const TEXT_FONT_SIZES = [12, 14, 16, 18, 22, 26, 32]

  // If external document is provided (player mode), use it; otherwise use store
  const isPlayerMode = externalDoc !== undefined
  const activeDoc = isPlayerMode ? (externalDoc ?? null) : (documents.find((d) => d.id === activeDocId) ?? null)

  // Chord preference hook — must be called unconditionally; pass null when not a .cho doc
  const isChoActive = activeDoc?.file_type === 'cho'
  const { transposition, updateTransposition } = useChordPreference(isChoActive ? activeDoc!.id : null)

  // Flush annotations on unmount
  useEffect(() => {
    return () => { useAnnotationStore.getState().flushAll() }
  }, [])

  // Toggle body-scroll-fs class
  useEffect(() => {
    if (!bodyScrollFs) {
      document.body.classList.remove('body-scroll-fs')
      return
    }
    document.body.classList.add('body-scroll-fs')
    window.scrollTo(0, 0)
    setShowSwipeHint(true)
    const onScroll = () => setShowSwipeHint(false)
    window.addEventListener('scroll', onScroll, { once: true })
    const timer = setTimeout(() => setShowSwipeHint(false), 6000)
    return () => {
      document.body.classList.remove('body-scroll-fs')
      window.scrollTo(0, 0)
      window.removeEventListener('scroll', onScroll)
      clearTimeout(timer)
      setShowSwipeHint(false)
    }
  }, [bodyScrollFs])

  // Keep scrollTargetRef in sync — documentElement in body-scroll, otherwise viewer container.
  // Runs every render so it stays correct even after viewer ref callbacks overwrite scrollContainerRef.
  useEffect(() => {
    scrollTargetRef.current = bodyScrollFs
      ? document.documentElement
      : scrollContainerRef.current
  })

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

  // Manuelles Page up/down im Vollbild — springt einen Viewport (mit kleinem Overlap)
  const handlePageScroll = useCallback((direction: 'up' | 'down') => {
    const el = scrollTargetRef.current
    if (!el) return
    const step = Math.max(el.clientHeight - 40, 40)
    el.scrollBy({ top: direction === 'down' ? step : -step, behavior: 'smooth' })
  }, [])

  // Autoscroll: nur im Vollbild, nur bei Text/Chord/PDF, pausiert wenn Audio geladen aber nicht spielt
  const isScrollableType = activeDoc?.file_type === 'pdf' || activeDoc?.file_type === 'txt' || activeDoc?.file_type === 'cho'
  const autoScrollActive =
    pdfFullscreen &&
    isScrollableType &&
    autoScrollEnabled &&
    (currentPath === null || isPlaying)
  const autoScrollPxPerSec = AUTO_SCROLL_BASE_PX_PER_SEC * AUTO_SCROLL_SPEEDS[autoScrollSpeedIdx]
  useAutoScroll(scrollTargetRef, autoScrollActive, autoScrollPxPerSec, () => {
    setAutoScrollEnabled(false)
  })

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
          accept=".pdf,.txt,.cho"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>
    )
  }

  if (!activeDoc) return null

  const isPdf = activeDoc.file_type === 'pdf'
  const isTxt = activeDoc.file_type === 'txt'
  const isCho = activeDoc.file_type === 'cho'
  const pdfUrl = `/api/documents/${activeDoc.id}/download?token=${token}`

  return (
    <div className={`pdf-panel${pdfFullscreen ? ' pdf-panel--fullscreen' : ''}`}>
      {/* Toolbar (PDF only) — hidden in fullscreen */}
      {isPdf && !pdfFullscreen && (
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

      {/* Non-PDF toolbar — hidden in fullscreen */}
      {!isPdf && !pdfFullscreen && (
        <div className="pdf-toolbar">
          <span className="pdf-toolbar-name">
            {getDocIcon(activeDoc.file_type)} {activeDoc.original_name}
          </span>
        </div>
      )}

      {(isPdf || isCho) && drawingMode && (
        <AnnotationToolbar pageKey={`${activeDoc.id}::1`} />
      )}

      {/* Content area */}
      {activeDoc.file_type === 'pdf' && (
        <div
          ref={(el) => {
            pagesRef.current = el
            scrollContainerRef.current = el
          }}
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
          scrollContainerRef={scrollContainerRef}
        />
      )}

      {activeDoc.file_type === 'cho' && (
        <ChordSheetTextViewer
          docId={activeDoc.id}
          originalName={activeDoc.original_name}
          transposition={transposition}
          fontSize={TEXT_FONT_SIZES[textSizeIndex]}
          showName={!pdfFullscreen}
          scrollContainerRef={scrollContainerRef}
        />
      )}

      {/* FABs — PDF/CHO: Draw + Fullscreen, TXT/CHO: Zoom + Fullscreen, CHO: Transpose.
          Annotations sind ein per-User-Feature (annotations.write = member+) —
          Gaeste sehen den Zeichenmodus-FAB nicht. */}
      {!guest && (isPdf || isCho) && (
        <button
          className={`pdf-fab pdf-fab--draw${drawingMode ? ' pdf-fab--draw-active' : ''}${pdfFullscreen && fabFaded ? ' pdf-fab--faded' : ''}`}
          onClick={() => setDrawingMode(!drawingMode)}
          onTouchStart={pdfFullscreen ? resetFadeTimer : undefined}
          aria-label={drawingMode ? 'Zeichenmodus beenden' : 'Zeichnen'}
        >
          <PenLine size={18} />
        </button>
      )}
      {(isTxt || isCho) && pdfFullscreen && (
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
      {isCho && (
        <div
          className={`transpose-stepper transpose-stepper--floating${pdfFullscreen && fabFaded ? ' pdf-fab--faded' : ''}`}
          onTouchStart={pdfFullscreen ? resetFadeTimer : undefined}
        >
          <TransposeButtons
            value={transposition}
            onChange={(v) => { updateTransposition(v); resetFadeTimer() }}
          />
        </div>
      )}
      {pdfFullscreen && (isPdf || isTxt || isCho) && (
        <AutoScrollStepper
          faded={fabFaded}
          onInteract={resetFadeTimer}
          onPageUp={() => handlePageScroll('up')}
          onPageDown={() => handlePageScroll('down')}
        />
      )}
      {(isPdf || isTxt || isCho) && (
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

      {showSwipeHint && (
        <div className="swipe-hint">
          <span className="swipe-hint-arrow">&#8593;</span>
          Nach oben wischen
        </div>
      )}

      {canUpload && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.cho"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      )}
    </div>
  )
}
