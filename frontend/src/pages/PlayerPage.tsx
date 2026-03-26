import { useNavigate } from 'react-router-dom'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useWaveform } from '@/hooks/useWaveform.ts'
import { Waveform } from '@/components/ui/Waveform.tsx'
import { formatTime } from '@/utils/formatters.ts'

export function PlayerPage() {
  const navigate = useNavigate()
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

  const setA = () => {
    usePlayerStore.getState().setLoopStart(currentTime)
  }

  const setB = () => {
    usePlayerStore.getState().setLoopEnd(currentTime)
  }

  const toggleLoop = () => {
    usePlayerStore.getState().toggleLoop()
  }

  const clearLoop = () => {
    usePlayerStore.getState().clearLoop()
  }

  const addMarker = () => {
    usePlayerStore.getState().addMarker(currentTime)
  }

  const folderPath = currentPath.split('/').slice(0, -1).join('/')

  return (
    <div className="player-page">
      {/* Header */}
      <div className="player-header">
        <button className="btn-icon" onClick={() => navigate(-1)}>
          {'\u25BE'}
        </button>
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Wird abgespielt</span>
        <div style={{ width: 44 }} />
      </div>

      {/* Track info */}
      <div className="player-track-info">
        <div className="player-track-icon">{'\uD83C\uDFB5'}</div>
        <div className="player-track-name">{currentName}</div>
        <div className="player-track-path">{folderPath}</div>
      </div>

      {/* Markers */}
      {markers.length > 0 && (
        <div className="player-markers">
          {markers.map((m) => (
            <button
              key={m.id}
              className="player-marker-btn"
              onClick={() => seek(m.time)}
            >
              {'\u25CF'} {formatTime(m.time)}
            </button>
          ))}
        </div>
      )}

      {/* Time */}
      <div className="player-time">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Waveform with cycle region */}
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

      {/* Transport controls */}
      <div className="player-transport">
        <button className="player-transport-btn" onClick={() => skip(-15)}>
          {'\u23EA'} 15
        </button>
        <button className="player-transport-btn player-transport-play" onClick={togglePlay}>
          {isPlaying ? '\u23F8' : '\u25B6'}
        </button>
        <button className="player-transport-btn" onClick={() => skip(15)}>
          15 {'\u23E9'}
        </button>
      </div>

      {/* Cycle play controls */}
      <div className="player-cycle">
        <button
          className={`player-cycle-btn ${loopStart !== null ? 'active' : ''}`}
          onClick={setA}
        >
          A
        </button>
        <button
          className={`player-cycle-btn ${loopEnd !== null ? 'active' : ''}`}
          onClick={setB}
        >
          B
        </button>
        <button
          className={`player-cycle-btn ${loopEnabled ? 'active' : ''}`}
          onClick={toggleLoop}
          disabled={loopStart === null || loopEnd === null}
        >
          {'\uD83D\uDD01'}
        </button>
        <button
          className="player-cycle-btn"
          onClick={clearLoop}
          disabled={loopStart === null && loopEnd === null}
        >
          {'\uD83D\uDDD1'}
        </button>
      </div>

      {/* Marker button */}
      <button className="player-marker-add" onClick={addMarker}>
        {'\uD83D\uDCCC'} Marker setzen
      </button>
    </div>
  )
}
