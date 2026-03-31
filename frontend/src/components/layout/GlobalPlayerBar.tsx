import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { Play, Pause, MoreVertical, Repeat, X, Trash2, MapPin, ListPlus } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useLoopControls } from '@/hooks/useLoopControls.ts'
import { formatTime } from '@/utils/formatters.ts'
import type { Marker } from '@/stores/playerStore'

const SKIP_OPTIONS = [1, 5, 10, 15] as const

function SkipIcon({ seconds, direction }: { seconds: number; direction: 'back' | 'fwd' }) {
  const flip = direction === 'back'
  return (
    <svg width={36} height={36} viewBox="0 0 24 24" fill="none" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
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
  const trackRef = useRef<HTMLDivElement>(null)
  const lastTappedRef = useRef<string | null>(null)

  const handleSeek = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const track = trackRef.current
    if (!track || duration <= 0) return
    const rect = track.getBoundingClientRect()
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

  const location = useLocation()
  const hiddenRoutes = ['/', '/browse', '/favorites', '/settings']
  const isHidden = hiddenRoutes.includes(location.pathname)
  const isSections = location.pathname === '/sections'
  const canGenerateSections = isSections && markers.length >= 2

  if (!currentPath || isHidden) return null

  const hasLoopRange = loopStart != null && loopEnd != null
  const hasActiveLoop = loopEnabled && hasLoopRange && duration > 0
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

      {/* Seek bar + time labels */}
      <div className="seek-bar" ref={seekBarRef} onClick={handleSeek}>
        <div className="seek-bar-track" ref={trackRef}>
          {hasActiveLoop ? (
            <div
              className="seek-bar-loop-fill"
              style={{
                left: `${(loopStart! / duration) * 100}%`,
                width: `${((loopEnd! - loopStart!) / duration) * 100}%`,
              }}
            />
          ) : (
            <div className="seek-bar-played" style={{ width: `${progress}%` }} />
          )}
          <div className={`seek-bar-thumb${hasActiveLoop ? ' seek-bar-thumb--loop' : ''}`} style={{ left: `${progress}%` }} />
          {markers.length > 0 && duration > 0 && markers.map((m) => (
            <span
              key={m.id}
              className="seek-bar-marker-dot"
              style={{ left: `${(m.time / duration) * 100}%` }}
            />
          ))}
        </div>
        <div className="seek-bar-times">
          <span className="seek-bar-time">{formatTime(currentTime)}</span>
          <span className="seek-bar-time">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls — pure flex, no absolute positioning */}
      <div className="global-player-controls">
        <div className="gpc-side gpc-side--left">
          {isSections && (
            <button
              className="gpc-btn"
              onClick={() => window.dispatchEvent(new Event('generate-sections'))}
              disabled={!canGenerateSections}
              aria-label="Sektionen erstellen"
            >
              <ListPlus size={22} />
            </button>
          )}
          <button
            className={`gpc-btn${hasLoopRange ? (loopEnabled ? ' gpc-btn--active' : '') : ''}`}
            onClick={handleLoopTap}
            disabled={!hasLoopRange}
            aria-label="Loop ein/aus"
          >
            <Repeat size={22} />
          </button>
        </div>

        <div className="gpc-center">
          <button className="gpc-btn gpc-btn-skip" onClick={() => skip(-skipInterval)}>
            <SkipIcon seconds={skipInterval} direction="back" />
          </button>
          <button className="gpc-btn-play" onClick={togglePlay}>
            {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: 2 }} />}
          </button>
          <button className="gpc-btn gpc-btn-skip" onClick={() => skip(skipInterval)}>
            <SkipIcon seconds={skipInterval} direction="fwd" />
          </button>
        </div>

        <div className="gpc-side gpc-side--right">
          <button className="gpc-btn" onClick={addMarker} aria-label="Marker setzen">
            <MapPin size={32} />
          </button>
        </div>

        <div className="gpc-menu" ref={menuRef}>
          <button
            className="gpc-btn gpc-btn-menu"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Skip-Zeit aendern"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <div className="gpc-menu-popup">
              {SKIP_OPTIONS.map((s) => (
                <button
                  key={s}
                  className={`gpc-menu-item ${s === skipInterval ? 'active' : ''}`}
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
