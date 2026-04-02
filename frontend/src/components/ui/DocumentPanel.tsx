import { useMemo, useRef, useState, useCallback, useEffect } from 'react'
import { Download, Upload, Trash2, Maximize2, Minimize2, PenLine, FileText, Video, File, Eye, EyeOff } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
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


export function DocumentPanel({ folderPath, canUpload = false }: DocumentPanelProps) {
  const token = useAuthStore((s) => s.token)
  const { documents, activeDocId, loading, uploading, upload, remove, hide, unhide, setActive } = useDocumentsStore()
  const pdfFullscreen = usePlayerStore((s) => s.pdfFullscreen)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const drawingMode = useAnnotationStore((s) => s.drawingMode)
  const setDrawingMode = useAnnotationStore((s) => s.setDrawingMode)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pagesRef = useRef<HTMLDivElement>(null)
  const [confirmDelete, setConfirmDelete] = useState<DocumentItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [scale, setScale] = useState(1)
  const [fabFaded, setFabFaded] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pinchRef = useRef({ startDist: 0, startScale: 1 })

  const userVoicePart = useAuthStore((s) => s.user?.voice_part ?? '')

  // Smart sorting: voice_part match first, then sort_order, then alphabetical
  const visibleDocs = useMemo(() => {
    const visible = documents.filter((d) => !d.hidden)
    return sortDocs(visible, userVoicePart)
  }, [documents, userVoicePart])

  const hiddenDocs = useMemo(() => documents.filter((d) => d.hidden), [documents])
  const activeDoc = documents.find((d) => d.id === activeDocId) ?? null

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

  // Pinch-to-zoom
  useEffect(() => {
    const el = pagesRef.current
    if (!el) return

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
  }, [])

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

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    try {
      await remove(confirmDelete.id)
    } finally {
      setDeleting(false)
      setConfirmDelete(null)
    }
  }

  if (loading) {
    return (
      <div className="pdf-upload">
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Laden...</span>
      </div>
    )
  }

  // No documents at all
  if (documents.length === 0) {
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
          accept=".pdf,.mp4,.webm,.mov,.txt"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>
    )
  }

  // All hidden
  if (visibleDocs.length === 0) {
    return (
      <div className="pdf-upload">
        <div className="pdf-upload-text">
          {hiddenDocs.length} {hiddenDocs.length === 1 ? 'Dokument' : 'Dokumente'} ausgeblendet
        </div>
        <button
          className="pdf-upload-btn"
          onClick={() => setShowHidden(true)}
        >
          <Eye size={14} />
          Alle anzeigen
        </button>
        {showHidden && (
          <HiddenDocsOverlay docs={hiddenDocs} onUnhide={unhide} onClose={() => setShowHidden(false)} />
        )}
      </div>
    )
  }

  const isPdf = activeDoc?.file_type === 'pdf'
  const pdfUrl = activeDoc ? `/api/documents/${activeDoc.id}/download?token=${token}` : ''

  return (
    <div className="pdf-panel">
      {/* Tab bar for multiple docs */}
      {visibleDocs.length > 1 && (
        <div className="doc-tabs">
          <div className="doc-tabs-scroll">
            {visibleDocs.map((doc) => (
              <button
                key={doc.id}
                className={`doc-tab${doc.id === activeDocId ? ' doc-tab--active' : ''}`}
                onClick={() => setActive(doc.id)}
              >
                {getDocIcon(doc.file_type)}
                <span className="doc-tab-name">{doc.original_name}</span>
                {visibleDocs.length > 1 && (
                  <button
                    className="doc-tab-hide"
                    onClick={(e) => { e.stopPropagation(); hide(doc.id) }}
                    title="Ausblenden"
                  >
                    <EyeOff size={12} />
                  </button>
                )}
              </button>
            ))}
          </div>
          {hiddenDocs.length > 0 && (
            <button className="doc-tabs-hidden-badge" onClick={() => setShowHidden(true)}>
              +{hiddenDocs.length}
            </button>
          )}
        </div>
      )}

      {/* Toolbar (PDF only) */}
      {isPdf && activeDoc && (
        <div className="pdf-toolbar">
          <span className="pdf-toolbar-name">
            {activeDoc.original_name}
            {activeDoc.page_count > 1 && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> ({activeDoc.page_count} S.)</span>
            )}
          </span>
          <div className="pdf-toolbar-actions">
            {canUpload && (
              <button
                className="pdf-toolbar-btn"
                onClick={() => setConfirmDelete(activeDoc)}
                title="PDF loeschen"
                style={{ color: 'var(--danger)' }}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button
              className={`pdf-toolbar-btn${drawingMode ? ' pdf-toolbar-btn--active' : ''}`}
              onClick={() => setDrawingMode(!drawingMode)}
              title={drawingMode ? 'Zeichenmodus beenden' : 'Zeichnen'}
            >
              <PenLine size={16} />
            </button>
            <a href={pdfUrl} download={activeDoc.original_name} className="pdf-toolbar-btn" title="Download">
              <Download size={16} />
            </a>
          </div>
        </div>
      )}

      {/* Non-PDF toolbar */}
      {!isPdf && activeDoc && visibleDocs.length === 1 && (
        <div className="pdf-toolbar">
          <span className="pdf-toolbar-name">
            {getDocIcon(activeDoc.file_type)} {activeDoc.original_name}
          </span>
          {canUpload && (
            <div className="pdf-toolbar-actions">
              <button
                className="pdf-toolbar-btn"
                onClick={() => setConfirmDelete(activeDoc)}
                title="Loeschen"
                style={{ color: 'var(--danger)' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {isPdf && drawingMode && activeDoc && (
        <AnnotationToolbar pageKey={`${activeDoc.id}::1`} />
      )}

      {/* Content area */}
      {activeDoc?.file_type === 'pdf' && (
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

      {activeDoc?.file_type === 'video' && (
        <VideoViewer docId={activeDoc.id} originalName={activeDoc.original_name} />
      )}

      {activeDoc?.file_type === 'txt' && (
        <TextViewer docId={activeDoc.id} originalName={activeDoc.original_name} />
      )}

      {/* FABs (PDF only) */}
      {isPdf && (
        <>
          <button
            className={`pdf-fab pdf-fab--draw${drawingMode ? ' pdf-fab--draw-active' : ''}${pdfFullscreen && fabFaded ? ' pdf-fab--faded' : ''}`}
            onClick={() => setDrawingMode(!drawingMode)}
            onTouchStart={pdfFullscreen ? resetFadeTimer : undefined}
            aria-label={drawingMode ? 'Zeichenmodus beenden' : 'Zeichnen'}
          >
            <PenLine size={18} />
          </button>
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
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.mp4,.webm,.mov,.txt"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {confirmDelete && (
        <ConfirmDialog
          title="Dokument loeschen?"
          filename={confirmDelete.original_name}
          hint="Wird unwiderruflich geloescht."
          onClose={() => setConfirmDelete(null)}
          confirmLabel="Loeschen"
          confirmLoadingLabel="Loeschen..."
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}

      {showHidden && hiddenDocs.length > 0 && (
        <HiddenDocsOverlay docs={hiddenDocs} onUnhide={unhide} onClose={() => setShowHidden(false)} />
      )}
    </div>
  )
}


function HiddenDocsOverlay({
  docs, onUnhide, onClose,
}: {
  docs: DocumentItem[]
  onUnhide: (id: number) => Promise<void>
  onClose: () => void
}) {
  return (
    <ConfirmDialog
      title="Ausgeblendete Dokumente"
      onClose={onClose}
      confirmLabel="Fertig"
      onConfirm={onClose}
      cancelLabel={null}
      variant="secondary"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {docs.map((doc) => (
          <div key={doc.id} style={{
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)',
          }}>
            {getDocIcon(doc.file_type)}
            <span style={{ flex: 1, fontSize: 'var(--text-body-sm)' }}>{doc.original_name}</span>
            <button
              className="btn btn-secondary"
              style={{ padding: 'var(--space-1) var(--space-3)', fontSize: 'var(--text-sm)' }}
              onClick={() => onUnhide(doc.id)}
            >
              <Eye size={14} /> Zeigen
            </button>
          </div>
        ))}
      </div>
    </ConfirmDialog>
  )
}


/** Sort docs: voice_part match first, then sort_order, then alphabetical */
function sortDocs(docs: DocumentItem[], userVoicePart: string): DocumentItem[] {
  const voiceLower = userVoicePart.toLowerCase()
  return [...docs].sort((a, b) => {
    const aMatch = voiceLower && a.original_name.toLowerCase().includes(voiceLower) ? 0 : 1
    const bMatch = voiceLower && b.original_name.toLowerCase().includes(voiceLower) ? 0 : 1
    if (aMatch !== bMatch) return aMatch - bMatch
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.original_name.localeCompare(b.original_name)
  })
}
