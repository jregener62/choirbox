import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { LayoutList, EllipsisVertical, ChevronLeft } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useSectionsStore } from '@/hooks/useSections.ts'
import { useSelectedDocumentStore } from '@/hooks/useSelectedDocument.ts'
import { SectionCards } from '@/components/ui/SectionCards.tsx'
import { DotBar } from '@/components/ui/DotBar.tsx'
import { DocumentPanel } from '@/components/ui/DocumentPanel.tsx'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { buildTimeline } from '@/utils/buildTimeline'
import { parseTrackFilename } from '@/utils/parseTrackFilename'
import { voiceColor, voiceBg, voiceFullName } from '@/utils/voiceColors'
import { formatDisplayName, middleTruncate } from '@/utils/formatters.ts'
import { stripFolderExtension, isReservedName } from '@/utils/folderTypes.ts'
import type { TimelineEntry } from '@/utils/buildTimeline'

export function PlayerPage() {
  const navigate = useNavigate()
  const userRole = useAuthStore((s) => s.user?.role ?? 'guest')
  const isBeta = hasMinRole(userRole, 'beta-tester')
  const { sections, loadedFolder: sectionsLoadedFolder, load: loadSections } = useSectionsStore()
  const { selectedDoc, loadedFolder: selectedLoadedFolder, loadSelected } = useSelectedDocumentStore()
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
  const menuRef = useRef<HTMLDivElement>(null)

  // Derive folder path from current track
  const folderPath = currentPath ? currentPath.split('/').slice(0, -1).join('/') : ''
  // If inside a reserved folder (Audio, Multitrack), use the .song parent name
  const pathSegments = folderPath.split('/').filter(Boolean)
  const lastSegment = pathSegments[pathSegments.length - 1] || ''
  const folderName = isReservedName(lastSegment) && pathSegments.length >= 2
    ? stripFolderExtension(pathSegments[pathSegments.length - 2])
    : stripFolderExtension(lastSegment)
  const parsed = currentName ? parseTrackFilename(currentName, folderName) : null

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

  useEffect(() => {
    if (isBeta && folderPath && folderPath !== sectionsLoadedFolder) loadSections(folderPath)
  }, [isBeta, folderPath, sectionsLoadedFolder, loadSections])

  // Song folder path: if inside reserved folder (Audio etc.), go up to parent
  const songFolderPath = isReservedName(lastSegment) && pathSegments.length >= 2
    ? '/' + pathSegments.slice(0, -1).join('/')
    : folderPath

  useEffect(() => {
    if (songFolderPath && songFolderPath !== selectedLoadedFolder) loadSelected(songFolderPath)
  }, [songFolderPath, selectedLoadedFolder, loadSelected])

  // Reset fullscreen on unmount
  useEffect(() => {
    return () => { usePlayerStore.getState().setPdfFullscreen(false) }
  }, [])

  const handlePanelChange = (index: number) => {
    setActivePanel(index)
    if (index !== 1 && pdfFullscreen) usePlayerStore.getState().setPdfFullscreen(false)
  }

  const timeline = isBeta ? buildTimeline(sections, duration) : []
  const hasSections = isBeta && sections.length > 0
  const hasSelectedDoc = selectedDoc !== null
  const showDots = isBeta && hasSelectedDoc

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

  return (
    <div className="player-page">
      {/* Page header */}
      <div className={`topbar${pdfFullscreen && activePanel === 1 ? ' topbar--hidden' : ''}`}>
        <button className="topbar-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={22} />
        </button>
        <span className="mono-kicker" style={{ color: 'var(--text-primary)' }}>PLAYER</span>
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
        {isBeta && (
          <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              className="player-header-btn"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <EllipsisVertical size={20} />
            </button>
            {menuOpen && (
              <div className="popup-menu player-topbar-menu">
                <button className="popup-menu-item" onClick={() => { setMenuOpen(false); navigate('/sections') }}>
                  <LayoutList size={16} />
                  Sektionen editieren
                </button>
              </div>
            )}
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
              <DocumentPanel folderPath={folderPath} document={selectedDoc} emptyHint="Text im Texte-Ordner auswählen" />
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
      ) : hasSelectedDoc ? (
        <div className="player-scroll-content">
          <DocumentPanel folderPath={folderPath} document={selectedDoc} emptyHint="Text im Texte-Ordner auswählen" />
        </div>
      ) : null}
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
