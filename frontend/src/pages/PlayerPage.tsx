import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pin, LayoutList, EllipsisVertical, ChevronLeft } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useWaveform } from '@/hooks/useWaveform.ts'
import { useLoopControls } from '@/hooks/useLoopControls.ts'
import { useSectionsStore } from '@/hooks/useSections.ts'
import { SectionCards } from '@/components/ui/SectionCards.tsx'
import { PlayerControlsBar } from '@/components/ui/PlayerControlsBar.tsx'
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
  const { sections, loadedPath: sectionsLoadedPath, load: loadSections } = useSectionsStore()
  const {
    currentName, currentPath,
    currentTime, duration,
    loopEnabled, loopStart, loopEnd,
    activeSection,
    markers,
  } = usePlayerStore()
  const { seek } = useAudioPlayer()
  const { peaks } = useWaveform(currentPath)
  const { addMarker } = useLoopControls()

  if (!currentPath) {
    navigate('/', { replace: true })
    return null
  }

  const folderPath = currentPath.split('/').slice(0, -1).join('/')
  const folderName = folderPath.split('/').filter(Boolean).pop() || ''
  const parsed = currentName ? parseTrackFilename(currentName, folderName) : null

  useEffect(() => {
    if (currentPath && currentPath !== sectionsLoadedPath) loadSections(currentPath)
  }, [currentPath, sectionsLoadedPath, loadSections])

  const timeline = buildTimeline(sections, duration)
  const hasSections = sections.length > 0

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
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate('/')}>
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
      </div>
      <PlayerControlsBar peaks={peaks} timeline={timeline} markers={markers} />

      {/* Scrollable content */}
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
        )}
      </div>

      {/* Tools footer */}
      <PlayerFooter addMarker={addMarker} canEditSections={hasMinRole(userRole, 'pro-member')} navigate={navigate} />
    </div>
  )
}

function PlayerFooter({ addMarker, canEditSections, navigate }: { addMarker: () => void; canEditSections: boolean; navigate: (path: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  return (
    <div className="section-editor-footer">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button
          className="player-ab-btn"
          style={{ width: 170, padding: '10px 0', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, borderColor: 'var(--marker)', color: 'var(--marker)' }}
          onClick={addMarker}
        >
          <Pin size={18} />
          Setze Marker
        </button>
        {canEditSections && (
          <div ref={menuRef} style={{ position: 'absolute', right: 20 }}>
            <button
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <EllipsisVertical size={22} />
            </button>
            {menuOpen && (
              <div className="player-footer-menu">
                <button className="player-footer-menu-item" onClick={() => { setMenuOpen(false); navigate('/sections') }}>
                  <LayoutList size={16} />
                  Sektionen editieren
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
