import { useState, useRef, useEffect } from 'react'
import { Play, Pause, MoreVertical, Repeat, X, Trash2 } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useLoopControls } from '@/hooks/useLoopControls.ts'
import { useWaveform } from '@/hooks/useWaveform.ts'
import { MiniWaveform } from '@/components/ui/MiniWaveform.tsx'
import { formatTime } from '@/utils/formatters.ts'
import type { Marker } from '@/stores/playerStore'

const SKIP_OPTIONS = [1, 5, 10, 15] as const

function SkipIcon({ seconds, direction, size = 36 }: { seconds: number; direction: 'back' | 'fwd'; size?: number }) {
  const flip = direction === 'back'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path
        d="M12 5V1l5 4-5 4V5c-3.86 0-7 3.14-7 7s3.14 7 7 7 7-3.14 7-7h2c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9z"
        fill="currentColor"
      />
      <text x="12" y="14.5" textAnchor="middle" fontSize={seconds >= 10 ? '7' : '8.5'} fontWeight="700" fill="currentColor" fontFamily="system-ui, sans-serif">
        {seconds}
      </text>
    </svg>
  )
}

export function GlobalPlayerBar() {
  const {
    currentPath,
    isPlaying, currentTime, duration,
    loopStart, loopEnd, loopEnabled,
    markers, pendingLoopMarkerId, loopMarkerIds,
    skipInterval,
  } = usePlayerStore()
  const { togglePlay, skip, seek } = useAudioPlayer()
  const { handleLoopTap } = useLoopControls()
  const { peaks } = useWaveform(currentPath)

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const lastTappedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  if (!currentPath) return null

  const hasLoopRange = loopStart != null && loopEnd != null
  const hasWaveform = peaks.length > 0
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const handleMarkerTap = (m: Marker) => {
    const store = usePlayerStore.getState()
    const isOrange = m.id === store.pendingLoopMarkerId
      || (store.loopMarkerIds && store.loopMarkerIds.includes(m.id))

    if (isOrange) {
      if (store.loopMarkerIds) {
        store.clearLoop()
      } else {
        store.setPendingLoopMarker(null)
      }
      lastTappedRef.current = null
      seek(m.time)
      return
    }

    if (lastTappedRef.current === m.id) {
      lastTappedRef.current = null
      if (store.loopMarkerIds) store.clearLoop()
      if (store.pendingLoopMarkerId) {
        const pendingMarker = markers.find((mk) => mk.id === store.pendingLoopMarkerId)
        if (pendingMarker) {
          store.createLoopFromMarkers(pendingMarker, m)
          const earlier = pendingMarker.time <= m.time ? pendingMarker : m
          seek(earlier.time)
        }
      } else {
        store.setPendingLoopMarker(m.id)
        seek(m.time)
      }
      return
    }

    lastTappedRef.current = m.id
    seek(m.time)
  }

  const handleWaveformSeek = (time: number) => {
    seek(time)
    usePlayerStore.getState().setPlaying(true)
  }

  return (
    <div className="global-player">
      {/* Marker row */}
      {markers.length > 0 && (
        <div className="global-player-markers">
          {markers.map((m) => (
            <button
              key={m.id}
              className={`player-toolbar-marker${m.id === pendingLoopMarkerId || (loopMarkerIds && loopMarkerIds.includes(m.id)) ? ' player-toolbar-marker--pending' : ''}`}
              onClick={() => handleMarkerTap(m)}
            >
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

      {/* Waveform / progress bar */}
      <div className="global-player-waveform">
        {hasWaveform ? (
          <MiniWaveform
            peaks={peaks}
            currentTime={currentTime}
            duration={duration}
            loopStart={loopStart}
            loopEnd={loopEnd}
            loopEnabled={loopEnabled}
            markers={markers}
            onSeek={handleWaveformSeek}
          />
        ) : (
          <div className="global-player-progress">
            <div className="global-player-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="global-player-controls">
        <button
          className={`top-player-loop${hasLoopRange ? (loopEnabled ? ' top-player-loop--active' : ' top-player-loop--has-range') : ''}`}
          onClick={handleLoopTap}
          disabled={!hasLoopRange}
          aria-label="Loop ein/aus"
        >
          <Repeat size={18} />
        </button>
        <span className="top-player-time">{formatTime(currentTime)}</span>
        <div className="top-player-controls">
          <button className="top-player-skip" onClick={() => skip(-skipInterval)}>
            <SkipIcon seconds={skipInterval} direction="back" />
          </button>
          <button className="top-player-play" onClick={togglePlay}>
            {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: 2 }} />}
          </button>
          <button className="top-player-skip" onClick={() => skip(skipInterval)}>
            <SkipIcon seconds={skipInterval} direction="fwd" />
          </button>
        </div>
        <span className="top-player-time">{formatTime(duration)}</span>

        <div className="global-player-menu" ref={menuRef}>
          <button
            className="top-player-menu-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Skip-Zeit aendern"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="global-player-menu-popup">
              {SKIP_OPTIONS.map((s) => (
                <button
                  key={s}
                  className={`top-player-menu-item ${s === skipInterval ? 'active' : ''}`}
                  onClick={() => {
                    usePlayerStore.getState().setSkipInterval(s)
                    setMenuOpen(false)
                  }}
                >
                  {s}s
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
