import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Pause, Play, Rewind, FastForward, Repeat, Pin, Heart, X } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useWaveform } from '@/hooks/useWaveform.ts'
import { useFavoritesStore } from '@/hooks/useFavorites.ts'
import { Waveform } from '@/components/ui/Waveform.tsx'
import { formatTime } from '@/utils/formatters.ts'

export function PlayerPage() {
  const navigate = useNavigate()
  const { loaded, load, isFavorite, toggle } = useFavoritesStore()
  const {
    currentName, currentPath,
    isPlaying, currentTime, duration,
    loopStart, loopEnd, loopEnabled,
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
  }, [loaded, load])

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
        <div className="player-track-name">{currentName}</div>
        <div className="player-track-path">{folderPath}</div>
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
        onSeek={seek}
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
            <button key={m.id} className="marker-chip" onClick={() => seek(m.time)}>
              <span className="marker-dot" />
              {formatTime(m.time)}
            </button>
          ))}
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
          className={`player-action-btn ${isFav ? 'player-action-btn--active' : ''}`}
          onClick={() => currentPath && toggle(currentPath)}
        >
          <Heart size={14} fill={isFav ? 'currentColor' : 'none'} /> {isFav ? 'Favorit' : 'Favorit'}
        </button>
      </div>
    </div>
  )
}
