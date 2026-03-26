import { useNavigate } from 'react-router-dom'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
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

  if (!currentPath) {
    navigate('/', { replace: true })
    return null
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  // Loop region as percentage
  const loopStartPct = loopStart !== null && duration > 0 ? (loopStart / duration) * 100 : null
  const loopEndPct = loopEnd !== null && duration > 0 ? (loopEnd / duration) * 100 : null

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    seek(pct * duration)
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

  // Extract folder path from full dropbox path
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

      {/* Progress bar with loop region */}
      <div className="player-progress" onClick={handleProgressClick}>
        {/* Loop region highlight */}
        {loopStartPct !== null && loopEndPct !== null && (
          <div
            className="player-progress-loop"
            style={{
              left: `${loopStartPct}%`,
              width: `${loopEndPct - loopStartPct}%`,
              opacity: loopEnabled ? 0.4 : 0.2,
            }}
          />
        )}
        {/* Playhead */}
        <div className="player-progress-fill" style={{ width: `${progress}%` }} />
        {/* Marker dots */}
        {markers.map((m) => (
          <div
            key={m.id}
            className="player-progress-marker"
            style={{ left: `${duration > 0 ? (m.time / duration) * 100 : 0}%` }}
          />
        ))}
        {/* A/B indicators */}
        {loopStartPct !== null && (
          <div className="player-progress-ab" style={{ left: `${loopStartPct}%` }}>A</div>
        )}
        {loopEndPct !== null && (
          <div className="player-progress-ab" style={{ left: `${loopEndPct}%` }}>B</div>
        )}
      </div>

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
