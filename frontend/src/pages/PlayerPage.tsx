import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Pause, Play, Rewind, FastForward, Repeat, Pin, Heart, X, Tag, Trash2, LayoutList } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useWaveform } from '@/hooks/useWaveform.ts'
import { useFavoritesStore } from '@/hooks/useFavorites.ts'
import { useLabelsStore } from '@/hooks/useLabels.ts'
import { useSectionsStore } from '@/hooks/useSections.ts'
import { Waveform } from '@/components/ui/Waveform.tsx'
import { SectionLane } from '@/components/ui/SectionLane.tsx'
import { VoiceIcon } from '@/components/ui/VoiceIcon'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { formatTime } from '@/utils/formatters.ts'

export function PlayerPage() {
  const navigate = useNavigate()
  const userRole = useAuthStore((s) => s.user?.role ?? 'guest')
  const { loaded, load, isFavorite, toggle } = useFavoritesStore()
  const { labels, loaded: labelsLoaded, load: loadLabels, getLabelsForPath, isAssigned, toggleLabel } = useLabelsStore()
  const { sections, loadedPath: sectionsLoadedPath, load: loadSections } = useSectionsStore()
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const {
    currentName, currentPath,
    isPlaying, currentTime, duration,
    loopStart, loopEnd, loopEnabled,
    activeSection,
    markers,
  } = usePlayerStore()
  const { togglePlay, seek, skip } = useAudioPlayer()
  const { peaks } = useWaveform(currentPath)

  if (!currentPath) {
    navigate('/', { replace: true })
    return null
  }

  const setA = () => usePlayerStore.getState().setLoopStart(currentTime)
  const setB = () => usePlayerStore.getState().setLoopEnd(currentTime)
  const toggleLoop = () => usePlayerStore.getState().toggleLoop()
  const clearLoop = () => usePlayerStore.getState().clearLoop()
  const addMarker = () => usePlayerStore.getState().addMarker(currentTime)

  const folderPath = currentPath.split('/').slice(0, -1).join('/')
  const isFav = currentPath ? isFavorite(currentPath) : false

  useEffect(() => {
    if (!loaded) load()
    if (!labelsLoaded) loadLabels()
  }, [loaded, load, labelsLoaded, loadLabels])

  useEffect(() => {
    if (currentPath && currentPath !== sectionsLoadedPath) loadSections(currentPath)
  }, [currentPath, sectionsLoadedPath, loadSections])

  const assignedLabels = currentPath ? getLabelsForPath(currentPath) : []

  return (
    <div className="player-page">
      {/* Header */}
      <div className="player-header">
        <button className="player-header-btn" onClick={() => navigate(-1)}>
          <ChevronDown size={24} />
        </button>
        <span className="player-header-title">Wird abgespielt</span>
        <div style={{ width: 40 }} />
      </div>

      {/* Track Info */}
      <div className="player-track-info">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
          {currentName && (
            <VoiceIcon
              filename={currentName}
              folderName={folderPath.split('/').filter(Boolean).pop() || ''}
            />
          )}
          <div className="player-track-name">{currentName}</div>
        </div>
        <div className="player-track-path">{folderPath}</div>
        {assignedLabels.length > 0 && (
          <div className="player-labels" style={{ marginTop: 8 }}>
            {assignedLabels.map((l) => (
              <span key={l.id} className="label-chip" style={{ background: l.color + '25', color: l.color }}>
                {l.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Waveform */}
      <Waveform
        peaks={peaks}
        currentTime={currentTime}
        duration={duration}
        loopStart={loopStart}
        loopEnd={loopEnd}
        loopEnabled={loopEnabled}
        markers={markers}
        sections={sections}
        activeSectionId={activeSection?.id ?? null}
        onSeek={seek}
      />

      {/* Section Lane */}
      <SectionLane
        sections={sections}
        duration={duration}
        activeSectionId={activeSection?.id ?? null}
        onSectionClick={(s) => {
          const store = usePlayerStore.getState()
          if (store.activeSection?.id === s.id) {
            store.setSectionLoop(null)
          } else {
            store.setSectionLoop(s)
            seek(s.start_time)
          }
        }}
      />

      {/* Timestamps */}
      <div className="player-time">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Markers */}
      {markers.length > 0 && (
        <div className="player-markers">
          {markers.map((m) => (
            <span key={m.id} className="marker-chip">
              <span className="marker-dot" />
              <button className="marker-chip-jump" onClick={() => seek(m.time)}>
                {formatTime(m.time)}
              </button>
              <button
                className="marker-chip-remove"
                onClick={() => usePlayerStore.getState().removeMarker(m.id)}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          <button
            className="marker-chip-remove"
            style={{ padding: '4px 8px' }}
            onClick={() => usePlayerStore.getState().clearMarkers()}
            title="Alle Marker loeschen"
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      {/* Divider */}
      <div className="player-divider" />

      {/* KERN: A + Play + B */}
      <div className="player-core">
        <button
          className={`player-ab-btn ${loopStart !== null ? 'active' : ''}`}
          onClick={setA}
        >
          A
        </button>
        <button className="player-play-btn" onClick={togglePlay}>
          {isPlaying ? <Pause size={32} /> : <Play size={32} style={{ marginLeft: 3 }} />}
        </button>
        <button
          className={`player-ab-btn ${loopEnd !== null ? 'active' : ''}`}
          onClick={setB}
        >
          B
        </button>
      </div>

      {/* Skip + Loop */}
      <div className="player-controls">
        <button className="player-ctrl-btn" onClick={() => skip(-15)}>
          <Rewind size={18} /> 15s
        </button>
        <button
          className={`player-ctrl-btn ${loopEnabled ? 'player-ctrl-amber' : ''}`}
          onClick={toggleLoop}
          disabled={loopStart === null || loopEnd === null}
        >
          <Repeat size={18} /> Loop
        </button>
        {(loopStart !== null || loopEnd !== null) && (
          <button className="player-ctrl-btn" onClick={clearLoop}>
            <X size={18} />
          </button>
        )}
        <button className="player-ctrl-btn" onClick={() => skip(15)}>
          15s <FastForward size={18} />
        </button>
      </div>

      {/* Marker + Tempo + Favorit */}
      <div className="player-actions">
        <button className="player-action-btn" onClick={addMarker}>
          <Pin size={14} /> Marker
        </button>
        <button
          className={`player-action-btn ${assignedLabels.length > 0 ? 'player-action-btn--label' : ''}`}
          onClick={() => setShowLabelPicker(!showLabelPicker)}
        >
          <Tag size={14} /> Labels
        </button>
        <button
          className={`player-action-btn ${isFav ? 'player-action-btn--active' : ''}`}
          onClick={() => currentPath && toggle(currentPath)}
        >
          <Heart size={14} fill={isFav ? 'currentColor' : 'none'} /> Favorit
        </button>
        {hasMinRole(userRole, 'admin') && (
          <button className="player-action-btn" onClick={() => navigate('/sections')}>
            <LayoutList size={14} /> Sektionen
          </button>
        )}
      </div>

      {/* Label Picker */}
      {showLabelPicker && currentPath && (
        <div className="label-picker">
          {labels.map((l) => {
            const assigned = isAssigned(currentPath, l.id)
            return (
              <button
                key={l.id}
                className={`label-picker-item ${assigned ? 'assigned' : ''}`}
                style={{
                  borderColor: assigned ? l.color : 'var(--border)',
                  background: assigned ? l.color + '25' : 'none',
                  color: assigned ? l.color : 'var(--text-secondary)',
                }}
                onClick={() => toggleLabel(currentPath, l.id)}
              >
                <span className="label-picker-dot" style={{ background: l.color }} />
                {l.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
