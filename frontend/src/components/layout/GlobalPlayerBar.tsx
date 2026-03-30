import { useState, useRef, useEffect, useCallback } from 'react'
import { Play, Pause, MoreVertical, Repeat, X, Trash2, MapPin } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useLoopControls } from '@/hooks/useLoopControls.ts'
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
  const { addMarker, handleLoopTap } = useLoopControls()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const seekBarRef = useRef<HTMLDivElement>(null)
  const lastTappedRef = useRef<string | null>(null)

  const handleSeek = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const bar = seekBarRef.current
    if (!bar || duration <= 0) return
    const rect = bar.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    seek(frac * duration)
    usePlayerStore.getState().setPlaying(true)
  }, [duration, seek])

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

      {/* Seek bar */}
      <div className="seek-bar" ref={seekBarRef} onClick={handleSeek}>
        {loopEnabled && loopStart != null && loopEnd != null && duration > 0 && (
          <div
            className="seek-bar-loop"
            style={{
              left: `${(loopStart / duration) * 100}%`,
              width: `${((loopEnd - loopStart) / duration) * 100}%`,
            }}
          />
        )}
        <div className="seek-bar-track">
          <div className="seek-bar-played" style={{ width: `${progress}%` }} />
        </div>
        <div className="seek-bar-thumb" style={{ left: `${progress}%` }} />
        {markers.length > 0 && duration > 0 && (
          <div className="seek-bar-markers">
            {markers.map((m) => (
              <span
                key={m.id}
                className="seek-bar-marker-dot"
                style={{ left: `${(m.time / duration) * 100}%` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="global-player-controls">
        <div className="gpc-slot">
          <button
            className={`global-player-side-btn${hasLoopRange ? (loopEnabled ? ' global-player-side-btn--active' : ' global-player-side-btn--has-range') : ''}`}
            onClick={handleLoopTap}
            disabled={!hasLoopRange}
            aria-label="Loop ein/aus"
          >
            <Repeat size={24} />
          </button>
        </div>

        <div className="gpc-center">
          <span className="top-player-time">{formatTime(currentTime)}</span>
          <button className="top-player-skip" onClick={() => skip(-skipInterval)}>
            <SkipIcon seconds={skipInterval} direction="back" />
          </button>
          <button className="top-player-play" onClick={togglePlay}>
            {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: 2 }} />}
          </button>
          <button className="top-player-skip" onClick={() => skip(skipInterval)}>
            <SkipIcon seconds={skipInterval} direction="fwd" />
          </button>
          <span className="top-player-time">{formatTime(duration)}</span>
        </div>

        <div className="gpc-slot">
          <button
            className="global-player-side-btn"
            onClick={addMarker}
            aria-label="Marker setzen"
          >
            <MapPin size={24} />
          </button>
        </div>

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
