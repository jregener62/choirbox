import { useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Repeat, Pin, X, Trash2, LayoutList, ArrowLeftToLine, ArrowRightToLine, ChevronDown } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useWaveform } from '@/hooks/useWaveform.ts'
import { useSectionsStore } from '@/hooks/useSections.ts'
import { UnifiedTimeline } from '@/components/ui/UnifiedTimeline.tsx'
import { VoiceIcon } from '@/components/ui/VoiceIcon'
import { TopPlayerBar } from '@/components/ui/TopPlayerBar.tsx'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { buildTimeline } from '@/utils/buildTimeline'
import { PlayerLyrics } from '@/components/ui/PlayerLyrics.tsx'
import { formatTime, formatDisplayName } from '@/utils/formatters.ts'
import type { TimelineEntry } from '@/utils/buildTimeline'

export function PlayerPage() {
  const navigate = useNavigate()
  const userRole = useAuthStore((s) => s.user?.role ?? 'guest')
  const { sections, loadedPath: sectionsLoadedPath, load: loadSections } = useSectionsStore()
  const {
    currentName, currentPath,
    currentTime, duration,
    loopStart, loopEnd, loopEnabled,
    activeSection,
    markers,
  } = usePlayerStore()
  const { seek } = useAudioPlayer()
  const { peaks } = useWaveform(currentPath)

  if (!currentPath) {
    navigate('/', { replace: true })
    return null
  }

  const setA = () => usePlayerStore.getState().setLoopStart(currentTime)
  const setB = () => usePlayerStore.getState().setLoopEnd(currentTime)
  const addMarker = () => usePlayerStore.getState().addMarker(currentTime)

  const loopTapTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const loopLastTap = useRef(0)
  const handleLoopTap = useCallback(() => {
    const now = Date.now()
    if (now - loopLastTap.current < 300) {
      clearTimeout(loopTapTimer.current)
      usePlayerStore.getState().clearLoop()
    } else {
      loopTapTimer.current = setTimeout(() => {
        usePlayerStore.getState().toggleLoop()
      }, 300)
    }
    loopLastTap.current = now
  }, [])

  const folderPath = currentPath.split('/').slice(0, -1).join('/')

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
        <button className="top-player-back" onClick={() => navigate(-1)}>
          <ChevronDown size={22} />
        </button>
        <span className="topbar-title">Player</span>
      </div>
      <TopPlayerBar variant="full" />
      <div className="player-toolbar">
        <button className="player-toolbar-btn" onClick={addMarker}>
          <Pin size={16} />
        </button>
        <button
          className={`player-toolbar-btn ${loopStart !== null ? 'player-toolbar-btn--amber' : ''}`}
          onClick={setA}
        >
          <ArrowLeftToLine size={16} />
        </button>
        <button
          className={`player-toolbar-btn ${loopEnabled ? 'player-toolbar-btn--amber' : ''}`}
          onClick={handleLoopTap}
          disabled={loopStart === null || loopEnd === null}
        >
          <Repeat size={16} />
        </button>
        <button
          className={`player-toolbar-btn ${loopEnd !== null ? 'player-toolbar-btn--amber' : ''}`}
          onClick={setB}
        >
          <ArrowRightToLine size={16} />
        </button>
        {hasMinRole(userRole, 'pro-member') && (
          <button className="player-toolbar-btn" onClick={() => navigate('/sections')}>
            <LayoutList size={16} />
          </button>
        )}
      </div>
      {markers.length > 0 && (
        <div className="player-marker-row">
          {markers.map((m) => (
            <button key={m.id} className="player-toolbar-marker" onClick={() => seek(m.time)}>
              <span className="marker-dot" />
              {formatTime(m.time)}
              <span className="player-toolbar-marker-x" onClick={(e) => { e.stopPropagation(); usePlayerStore.getState().removeMarker(m.id) }}>
                <X size={10} />
              </span>
            </button>
          ))}
          <button className="player-toolbar-btn" onClick={() => usePlayerStore.getState().clearMarkers()} title="Alle Marker loeschen">
            <Trash2 size={14} />
          </button>
        </div>
      )}

      {/* Scrollable content */}
      <div className="player-scroll-content">
        {/* Track Info */}
        <div className="player-track-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
            {currentName && (
              <VoiceIcon
                filename={currentName}
                folderName={folderPath.split('/').filter(Boolean).pop() || ''}
              />
            )}
            <div className="player-track-name">{formatDisplayName(currentName!)}</div>
          </div>
        </div>

        {/* Waveform + Sections */}
        <UnifiedTimeline
          peaks={peaks}
          currentTime={currentTime}
          duration={duration}
          loopStart={loopStart}
          loopEnd={loopEnd}
          loopEnabled={loopEnabled}
          markers={markers}
          timeline={timeline}
          activeSectionId={activeSection?.id ?? null}
          hasSections={hasSections}
          onSeek={(time) => { seek(time); usePlayerStore.getState().setPlaying(true) }}
          onSectionClick={handleSectionClick}
        />



        {/* Lyrics & Notes */}
        <div className="player-lyrics-divider" />

        <PlayerLyrics
          dropboxPath={currentPath}
          currentTime={currentTime}
          duration={duration}
        />
      </div>
    </div>
  )
}
