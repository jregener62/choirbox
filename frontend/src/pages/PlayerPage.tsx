import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutList, EllipsisVertical, ChevronLeft, Info, FileUp, Trash2 } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useSectionsStore } from '@/hooks/useSections.ts'
import { usePdfStore } from '@/hooks/usePdf.ts'
import { SectionCards } from '@/components/ui/SectionCards.tsx'
import { DotBar } from '@/components/ui/DotBar.tsx'
import { PdfPanel } from '@/components/ui/PdfPanel.tsx'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { buildTimeline } from '@/utils/buildTimeline'
import { parseTrackFilename } from '@/utils/parseTrackFilename'
import { voiceColor, voiceBg, voiceFullName } from '@/utils/voiceColors'
import { formatDisplayName, middleTruncate } from '@/utils/formatters.ts'
import type { TimelineEntry } from '@/utils/buildTimeline'

export function PlayerPage() {
  const navigate = useNavigate()
  const userRole = useAuthStore((s) => s.user?.role ?? 'guest')
  const canEdit = hasMinRole(userRole, 'pro-member')
  const isBeta = hasMinRole(userRole, 'beta-tester')
  const { sections, loadedPath: sectionsLoadedPath, load: loadSections } = useSectionsStore()
  const { info: pdfInfo, loadedPath: pdfLoadedPath, load: loadPdf, upload, remove } = usePdfStore()
  const {
    currentName, currentPath,
    currentTime, duration,
    loopEnabled, loopStart, loopEnd,
    activeSection,
    pdfFullscreen,
  } = usePlayerStore()
  const { seek } = useAudioPlayer()

  const [activePanel, setActivePanel] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  if (!currentPath) {
    navigate('/', { replace: true })
    return null
  }

  const folderPath = currentPath.split('/').slice(0, -1).join('/')
  const folderName = folderPath.split('/').filter(Boolean).pop() || ''
  const parsed = currentName ? parseTrackFilename(currentName, folderName) : null

  useEffect(() => {
    if (isBeta && currentPath && currentPath !== sectionsLoadedPath) loadSections(currentPath)
  }, [isBeta, currentPath, sectionsLoadedPath, loadSections])

  useEffect(() => {
    if (currentPath && currentPath !== pdfLoadedPath) loadPdf(currentPath)
  }, [currentPath, pdfLoadedPath, loadPdf])

  // Reset fullscreen on unmount (navigation away)
  useEffect(() => {
    return () => { usePlayerStore.getState().setPdfFullscreen(false) }
  }, [])

  const handlePanelChange = (index: number) => {
    setActivePanel(index)
    if (index !== 1 && pdfFullscreen) usePlayerStore.getState().setPdfFullscreen(false)
  }

  const timeline = isBeta ? buildTimeline(sections, duration) : []
  const hasSections = isBeta && sections.length > 0
  const showDots = isBeta && (pdfInfo?.has_pdf || canEdit)
  const hasPdf = pdfInfo?.has_pdf ?? false

  const handleSectionClick = (entry: TimelineEntry) => {
    const store = usePlayerStore.getState()
    if (store.activeSection && !entry.isGap && store.activeSection.id === entry.id) {
      store.setSectionLoop(null)
    } else if (!entry.isGap) {
      const section = sections.find((s) => s.id === entry.id)
      if (section) {
        store.setSectionLoop(section)
        seek(section.start_time)
      }
    } else {
      store.clearLoop()
      store.setLoopStart(entry.start_time)
      store.setLoopEnd(entry.end_time)
      store.toggleLoop()
      seek(entry.start_time)
    }
  }

  const handlePdfSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await upload(currentPath, file)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    }
    e.target.value = ''
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await remove(currentPath)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="player-page">
      {/* Page header */}
      <div className={`topbar${pdfFullscreen && activePanel === 1 ? ' topbar--hidden' : ''}`}>
        <button className="topbar-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={22} />
        </button>
        <span className="topbar-title">Player</span>
        <div className="topbar-track">
          <span className="topbar-track-name">{middleTruncate(formatDisplayName(currentName!))}</span>
          {parsed && (
            <span
              className="topbar-voice-badge"
              style={{ background: voiceBg(parsed.voiceKey), color: voiceColor(parsed.voiceKey) }}
            >
              {voiceFullName(parsed.voiceKey)}
            </span>
          )}
        </div>
        {canEdit && (
          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              className="player-header-btn"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <EllipsisVertical size={20} />
            </button>
            {menuOpen && (
              <div className="player-topbar-menu">
                {hasMinRole(userRole, 'beta-tester') && (
                  <button className="player-footer-menu-item" onClick={() => { setMenuOpen(false); navigate('/sections') }}>
                    <LayoutList size={16} />
                    Sektionen editieren
                  </button>
                )}
                {hasMinRole(userRole, 'pro-member') && (
                  <button className="player-footer-menu-item" onClick={() => { setMenuOpen(false); navigate('/file-settings') }}>
                    <Info size={16} />
                    Datei-Einstellungen
                  </button>
                )}
                <button className="player-footer-menu-item" onClick={() => { setMenuOpen(false); fileInputRef.current?.click() }}>
                  <FileUp size={16} />
                  {hasPdf ? 'PDF ersetzen' : 'PDF hochladen'}
                </button>
                {hasPdf && (
                  <button className="player-footer-menu-item" style={{ color: 'var(--danger)' }} onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}>
                    <Trash2 size={16} />
                    PDF loeschen
                  </button>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={handlePdfSelect}
            />
          </div>
        )}
      </div>

      {showDots && (
        <DotBar count={2} activeIndex={activePanel} onDotClick={handlePanelChange} className={pdfFullscreen && activePanel === 1 ? 'dot-bar--hidden' : ''} />
      )}

      {showDots ? (
        <div className="player-content-area">
          <div
            className="player-content-panels"
            style={{ transform: `translateX(-${activePanel * 50}%)` }}
          >
            <div className="player-content-panel">
              <div className="player-scroll-content">
                {hasSections ? (
                  <SectionCards
                    timeline={timeline}
                    currentTime={currentTime}
                    activeSectionId={activeSection?.id ?? null}
                    activeGapIndex={null}
                    loopEnabled={loopEnabled}
                    loopStart={loopStart}
                    loopEnd={loopEnd}
                    onSectionClick={handleSectionClick}
                  />
                ) : (
                  <EmptySections />
                )}
              </div>
            </div>
            <div className="player-content-panel">
              <PdfPanel dropboxPath={currentPath} canUpload={canEdit} />
            </div>
          </div>
        </div>
      ) : isBeta ? (
        <div className="player-scroll-content">
          {hasSections ? (
            <SectionCards
              timeline={timeline}
              currentTime={currentTime}
              activeSectionId={activeSection?.id ?? null}
              activeGapIndex={null}
              loopEnabled={loopEnabled}
              loopStart={loopStart}
              loopEnd={loopEnd}
              onSectionClick={handleSectionClick}
            />
          ) : (
            <EmptySections />
          )}
        </div>
      ) : (hasPdf || canEdit) ? (
        <div className="player-scroll-content">
          <PdfPanel dropboxPath={currentPath} canUpload={canEdit} />
        </div>
      ) : null}

      {confirmDelete && (
        <div className="confirm-overlay" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title">PDF loeschen?</p>
            <p className="confirm-filename">{pdfInfo?.original_name}</p>
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

function EmptySections() {
  return (
    <div className="player-empty-sections">
      <svg className="player-empty-waveform" viewBox="0 0 120 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="18" width="3" height="12" rx="1.5" fill="currentColor" />
        <rect x="11" y="12" width="3" height="24" rx="1.5" fill="currentColor" />
        <rect x="18" y="8" width="3" height="32" rx="1.5" fill="currentColor" />
        <rect x="25" y="14" width="3" height="20" rx="1.5" fill="currentColor" />
        <rect x="32" y="4" width="3" height="40" rx="1.5" fill="currentColor" />
        <rect x="39" y="10" width="3" height="28" rx="1.5" fill="currentColor" />
        <rect x="46" y="16" width="3" height="16" rx="1.5" fill="currentColor" />
        <rect x="53" y="6" width="3" height="36" rx="1.5" fill="currentColor" />
        <rect x="60" y="2" width="3" height="44" rx="1.5" fill="currentColor" />
        <rect x="67" y="10" width="3" height="28" rx="1.5" fill="currentColor" />
        <rect x="74" y="16" width="3" height="16" rx="1.5" fill="currentColor" />
        <rect x="81" y="8" width="3" height="32" rx="1.5" fill="currentColor" />
        <rect x="88" y="14" width="3" height="20" rx="1.5" fill="currentColor" />
        <rect x="95" y="6" width="3" height="36" rx="1.5" fill="currentColor" />
        <rect x="102" y="12" width="3" height="24" rx="1.5" fill="currentColor" />
        <rect x="109" y="18" width="3" height="12" rx="1.5" fill="currentColor" />
      </svg>
      <span>Noch keine Sektionen festgelegt</span>
    </div>
  )
}
