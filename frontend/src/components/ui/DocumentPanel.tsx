import { useRef, useState, useCallback, useEffect } from 'react'
import { Download, Maximize2, Minimize2, PenLine, FileText, Video, File, Plus, Minus, Music, SquarePen } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import { useDisplayModeStore } from '@/stores/displayModeStore.ts'
import { useSheetEditMode } from '@/hooks/useSheetEditMode'
import { hasMinRole, isGuest } from '@/utils/roles.ts'
import { usePlayerStore, AUTO_SCROLL_SPEEDS, AUTO_SCROLL_BASE_PX_PER_SEC } from '@/stores/playerStore.ts'
import { useDocumentsStore } from '@/hooks/useDocuments.ts'
import { useAnnotationStore } from '@/hooks/useAnnotations.ts'
import { useChordPreference } from '@/hooks/useChordPreference.ts'
import { useChordInput } from '@/hooks/useChordInput.ts'
import { useAutoScroll } from '@/hooks/useAutoScroll.ts'
import { AnnotatedPage } from '@/components/ui/AnnotatedPage.tsx'
import { AnnotationToolbar } from '@/components/ui/AnnotationToolbar.tsx'
import { VideoViewer } from '@/components/ui/VideoViewer.tsx'
import { TextViewer } from '@/components/ui/TextViewer.tsx'
import { ChordSheetTextViewer } from '@/components/ui/ChordSheetTextViewer.tsx'
import { RtfViewer } from '@/components/ui/RtfViewer.tsx'
import { RtfEditor } from '@/components/ui/RtfEditor.tsx'
import { AutoScrollStepper } from '@/components/ui/AutoScrollStepper.tsx'
import { EditorActionsInline } from '@/components/ui/EditorActionsInline.tsx'
import { TransposeButtons } from '@/components/ui/TransposeButtons.tsx'
import type { DocumentItem } from '@/types/index.ts'

interface DocumentPanelProps {
  folderPath: string
  /** If provided, show only this document (player mode). Otherwise use documents store. */
  document?: DocumentItem | null
  /** Show hint when no document is selected (player mode) */
  emptyHint?: string
  /** If true, open the editor (RTF or SheetEditor) immediately once the active document is loaded. */
  autoEdit?: boolean
}

function getDocIcon(type: string, size = 14) {
  if (type === 'pdf') return <FileText size={size} />
  if (type === 'video') return <Video size={size} />
  if (type === 'cho') return <Music size={size} />
  if (type === 'rtf') return <FileText size={size} />
  return <File size={size} />
}

function getDistance(t1: Touch, t2: Touch) {
  const dx = t1.clientX - t2.clientX
  const dy = t1.clientY - t2.clientY
  return Math.sqrt(dx * dx + dy * dy)
}


export function DocumentPanel({ folderPath, document: externalDoc, emptyHint, autoEdit }: DocumentPanelProps) {
  const token = useAuthStore((s) => s.token)
  const userRole = useAuthStore((s) => s.user?.role)
  const guest = isGuest(userRole)
  const { documents, activeDocId, loading } = useDocumentsStore()
  const pdfFullscreen = usePlayerStore((s) => s.pdfFullscreen)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const currentPath = usePlayerStore((s) => s.currentPath)
  const autoScrollEnabled = usePlayerStore((s) => s.autoScrollEnabled)
  const autoScrollSpeedIdx = usePlayerStore((s) => s.autoScrollSpeedIdx)
  const setAutoScrollEnabled = usePlayerStore((s) => s.setAutoScrollEnabled)
  const drawingMode = useAnnotationStore((s) => s.drawingMode)
  const chordInputMode = useChordInput((s) => s.mode)
  const editMode = chordInputMode
  // anyEditorActive gating: verbirgt Viewer-FABs auch im RTF-Edit-Mode.
  const startEdit = useSheetEditMode((s) => s.start)
  const canEditSheet = hasMinRole(userRole ?? 'guest', 'pro-member')
  const setDrawingMode = useAnnotationStore((s) => s.setDrawingMode)
  const pagesRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  const scrollTargetRef = useRef<HTMLElement | null>(null)
  const [scale, setScale] = useState(1)
  const [fabFaded, setFabFaded] = useState(false)
  const [textSizeIndex, setTextSizeIndex] = useState(2)
  // View toggle: Akkorde ein/aus (Default: aus). Vocal-Marks sind entfallen
  // — .cho haelt sich jetzt strikt an den ChordPro-Standard.
  const [showChords, setShowChords] = useState(false)
  const [rtfEditing, setRtfEditing] = useState(false)
  const [rtfReloadToken, setRtfReloadToken] = useState(0)
  const [autoEditConsumed, setAutoEditConsumed] = useState(false)
  const choirDisplayMode = useDisplayModeStore((s) => s.choirMode)
  const chordsAllowed = choirDisplayMode !== 'vocal'
  // Im vocal-Modus duerfen chords nie sichtbar sein.
  useEffect(() => {
    if (!chordsAllowed && showChords) setShowChords(false)
  }, [chordsAllowed, showChords])
  const chordsHidden = !chordsAllowed || !showChords
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

  // Auto-edit consumer: opens the passenden Editor automatisch, sobald das
  // aktive Dokument geladen ist. Wird von den "Neues Chordsheet"- und
  // "Neuer Rich-Text"-Flows via ?edit=1 genutzt.
  useEffect(() => {
    if (!autoEdit || autoEditConsumed) return
    if (activeDoc?.file_type === 'rtf') {
      setRtfEditing(true)
      setAutoEditConsumed(true)
    } else if (activeDoc?.file_type === 'cho') {
      startEdit()
      setAutoEditConsumed(true)
    }
  }, [autoEdit, autoEditConsumed, activeDoc?.id, activeDoc?.file_type, startEdit])

  // Set theme-color to white in fullscreen so iOS Safari safe-area/notch
  // regions match the viewer background during rotation
  useEffect(() => {
    if (!pdfFullscreen) return
    const meta = document.querySelector('meta[name="theme-color"]')
    const original = meta?.getAttribute('content') ?? '#1a1a2e'
    meta?.setAttribute('content', '#ffffff')
    return () => { meta?.setAttribute('content', original) }
  }, [pdfFullscreen])

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

  const handleChordSheetCreated = useCallback(() => {
    useDocumentsStore.getState().load(folderPath)
  }, [folderPath])

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

  // Autoscroll: nur im Vollbild, nur bei Text/Chord/PDF/RTF, pausiert wenn Audio geladen aber nicht spielt
  const isScrollableType = activeDoc?.file_type === 'pdf' || activeDoc?.file_type === 'txt' || activeDoc?.file_type === 'cho' || activeDoc?.file_type === 'rtf'
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

  // DocViewer mode without docs: render nothing — die aufrufende Seite
  // zeigt bei Bedarf einen Fallback. Uploads laufen nicht ueber diesen Pfad.
  if (!isPlayerMode && !activeDoc) return null
  if (!activeDoc) return null

  const isPdf = activeDoc.file_type === 'pdf'
  const isTxt = activeDoc.file_type === 'txt'
  const isCho = activeDoc.file_type === 'cho'
  const isRtf = activeDoc.file_type === 'rtf'
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
          {!editMode && canEditSheet && isCho && (
            <div className="pdf-toolbar-actions">
              <button
                type="button"
                className="pdf-toolbar-btn"
                onClick={startEdit}
                title="Text bearbeiten"
              >
                <SquarePen size={16} />
              </button>
            </div>
          )}
          {!rtfEditing && canEditSheet && isRtf && (
            <div className="pdf-toolbar-actions">
              <button
                type="button"
                className="pdf-toolbar-btn"
                onClick={() => setRtfEditing(true)}
                title="Text bearbeiten"
              >
                <SquarePen size={16} />
              </button>
            </div>
          )}
          {editMode && <EditorActionsInline />}
        </div>
      )}

      {(isPdf || isCho || (isRtf && !rtfEditing)) && drawingMode && !editMode && (
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
          folderPath={folderPath}
          fontSize={TEXT_FONT_SIZES[textSizeIndex]}
          showName={!pdfFullscreen}
          scrollContainerRef={scrollContainerRef}
          onChordSheetCreated={handleChordSheetCreated}
        />
      )}

      {activeDoc.file_type === 'rtf' && !rtfEditing && (
        <RtfViewer
          key={rtfReloadToken}
          docId={activeDoc.id}
          originalName={activeDoc.original_name}
          fontSize={TEXT_FONT_SIZES[textSizeIndex]}
          showName={!pdfFullscreen}
          scrollContainerRef={scrollContainerRef}
        />
      )}

      {activeDoc.file_type === 'rtf' && rtfEditing && (
        <RtfEditor
          docId={activeDoc.id}
          originalName={activeDoc.original_name}
          onSaved={() => { setRtfEditing(false); setRtfReloadToken((n) => n + 1) }}
          onCancel={() => setRtfEditing(false)}
        />
      )}

      {activeDoc.file_type === 'cho' && (
        <ChordSheetTextViewer
          docId={activeDoc.id}
          originalName={activeDoc.original_name}
          transposition={transposition}
          fontSize={TEXT_FONT_SIZES[textSizeIndex]}
          showName={!pdfFullscreen}
          hideChords={chordsHidden}
          scrollContainerRef={scrollContainerRef}
        />
      )}

      {/* FABs — PDF/CHO: Draw + Fullscreen, TXT/CHO: Zoom + Fullscreen, CHO: Transpose.
          Annotations sind ein per-User-Feature (annotations.write = member+) —
          Gaeste sehen den Zeichenmodus-FAB nicht. */}
      {!guest && (isPdf || isCho || (isRtf && !rtfEditing)) && !editMode && (
        <button
          className={`pdf-fab pdf-fab--draw${drawingMode ? ' pdf-fab--draw-active' : ''}${pdfFullscreen && fabFaded ? ' pdf-fab--faded' : ''}`}
          onClick={() => setDrawingMode(!drawingMode)}
          onTouchStart={pdfFullscreen ? resetFadeTimer : undefined}
          aria-label={drawingMode ? 'Zeichenmodus beenden' : 'Zeichnen'}
        >
          <PenLine size={18} />
        </button>
      )}
      {(isTxt || isCho || (isRtf && !rtfEditing)) && pdfFullscreen && (
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
      {isCho && !editMode && (
        <div
          className={`chord-toolbar chord-toolbar--floating${pdfFullscreen ? '' : ' chord-toolbar--below-chrome'}${pdfFullscreen && drawingMode ? ' chord-toolbar--below-annotation' : ''}${pdfFullscreen && fabFaded ? ' pdf-fab--faded' : ''}`}
          onTouchStart={pdfFullscreen ? resetFadeTimer : undefined}
        >
          {!chordsHidden && (
            <div className="transpose-stepper">
              <TransposeButtons
                value={transposition}
                onChange={(v) => { updateTransposition(v); resetFadeTimer() }}
              />
            </div>
          )}
          {chordsAllowed && (
            <div className="chord-toggle-split" role="group" aria-label="Anzeige-Umschalter">
              <button
                type="button"
                className={`chord-toggle-segment chord-toggle-segment--chord${showChords ? ' chord-toggle-segment--active' : ''}`}
                onClick={() => { setShowChords((v) => !v); resetFadeTimer() }}
                aria-pressed={showChords}
                aria-label="Akkorde"
                title={showChords ? 'Akkorde ausblenden' : 'Akkorde anzeigen'}
              >
                <svg width="20" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <text x="6" y="18" fontFamily="Georgia, serif" fontSize="17" fontWeight="700">C</text>
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
      {pdfFullscreen && (isPdf || isTxt || isCho || (isRtf && !rtfEditing)) && !editMode && (
        <AutoScrollStepper
          faded={fabFaded}
          onInteract={resetFadeTimer}
          onPageUp={() => handlePageScroll('up')}
          onPageDown={() => handlePageScroll('down')}
        />
      )}
      {(isPdf || isTxt || isCho || (isRtf && !rtfEditing)) && !editMode && (
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

    </div>
  )
}
