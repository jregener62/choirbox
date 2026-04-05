import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { Play, Pause, MoreVertical, Repeat, MapPin, ListPlus, Rewind, FastForward, FileText } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useLoopControls } from '@/hooks/useLoopControls.ts'
import { useSelectedDocumentStore } from '@/hooks/useSelectedDocument.ts'
import { formatTime } from '@/utils/formatters.ts'
import { isReservedName } from '@/utils/folderTypes.ts'
// import { VoiceBricks } from '@/components/ui/VoiceBricks.tsx'
import type { Marker } from '@/stores/playerStore'

const SKIP_OPTIONS = [1, 5, 10, 15] as const

export function GlobalPlayerBar() {
  const navigate = useNavigate()
  const {
    currentPath,
    isPlaying, currentTime, duration,
    loopStart, loopEnd, loopEnabled,
    markers, pendingLoopMarkerId, loopMarkerIds,
    skipInterval,
  } = usePlayerStore()
  const { togglePlay, skip, seek } = useAudioPlayer()
  const { addMarker, handleLoopTap } = useLoopControls()
  const { selectedDoc, loadedFolder, loadSelected } = useSelectedDocumentStore()

  // Derive song folder path from current track (same logic as ViewerPage)
  const folderPath = currentPath ? currentPath.split('/').slice(0, -1).join('/') : ''
  const pathSegments = folderPath.split('/').filter(Boolean)
  const lastSegment = pathSegments[pathSegments.length - 1] || ''
  const songFolderPath = isReservedName(lastSegment) && pathSegments.length >= 2
    ? '/' + pathSegments.slice(0, -1).join('/')
    : folderPath

  useEffect(() => {
    if (songFolderPath && songFolderPath !== loadedFolder) loadSelected(songFolderPath)
  }, [songFolderPath, loadedFolder, loadSelected])

  const [menuOpen, setMenuOpen] = useState(false)
  const [markerMenuOpen, setMarkerMenuOpen] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const markerMenuRef = useRef<HTMLDivElement>(null)
  const deleteModeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seekBarRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const lastTappedRef = useRef<string | null>(null)

  const startDeleteMode = () => {
    setDeleteMode(true)
    setMarkerMenuOpen(false)
    if (deleteModeTimer.current) clearTimeout(deleteModeTimer.current)
    deleteModeTimer.current = setTimeout(() => setDeleteMode(false), 3000)
  }

  const handleDeleteMarker = (id: string) => {
    usePlayerStore.getState().removeMarker(id)
    if (deleteModeTimer.current) clearTimeout(deleteModeTimer.current)
    deleteModeTimer.current = setTimeout(() => setDeleteMode(false), 3000)
  }

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
    if (!menuOpen && !markerMenuOpen) return
    const close = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
      if (markerMenuOpen && markerMenuRef.current && !markerMenuRef.current.contains(e.target as Node)) setMarkerMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen, markerMenuOpen])

  useEffect(() => {
    return () => { if (deleteModeTimer.current) clearTimeout(deleteModeTimer.current) }
  }, [])

  const location = useLocation()
  const isSections = location.pathname === '/sections'
  const canGenerateSections = isSections && markers.length >= 2

  const pdfFullscreen = usePlayerStore((s) => s.pdfFullscreen)

  // Show whenever a track is loaded
  if (!currentPath) return null

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
    <div className={`global-player${pdfFullscreen ? ' global-player--hidden' : ''}`}>
      {/* Voice bricks row — temporarily hidden */}
      {/* <VoiceBricks /> */}

      {/* Marker row */}
      {markers.length > 0 && (
        <div className="global-player-markers">
          <div className="global-player-markers-scroll">
            {markers.map((m) => {
              const isPending = m.id === pendingLoopMarkerId || (loopMarkerIds && loopMarkerIds.includes(m.id))
              let cls = 'player-toolbar-marker'
              if (deleteMode) cls += ' player-toolbar-marker--deletable'
              else if (isPending) cls += ' player-toolbar-marker--pending'
              return (
                <button
                  key={m.id}
                  className={cls}
                  onClick={() => deleteMode ? handleDeleteMarker(m.id) : handleMarkerTap(m)}
                >
                  <span className="marker-dot" />
                  {formatTime(m.time)}
                </button>
              )
            })}
          </div>
          <div className="marker-kebab-wrap" ref={markerMenuRef}>
            <button className="player-toolbar-btn" onClick={() => setMarkerMenuOpen(!markerMenuOpen)} aria-label="Marker-Optionen">
              <MoreVertical size={14} />
            </button>
            {markerMenuOpen && (
              <div className="popup-menu marker-kebab-popup">
                <button className="popup-menu-item" onClick={startDeleteMode}>Marker loeschen</button>
                <button className="popup-menu-item" onClick={() => { usePlayerStore.getState().clearMarkers(); setMarkerMenuOpen(false); setDeleteMode(false) }}>Alle Marker loeschen</button>
              </div>
            )}
          </div>
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
          <button
            className={`gpc-btn${location.pathname === '/viewer' ? ' gpc-btn--active' : ''}`}
            onClick={() => {
              if (location.pathname === '/viewer') {
                navigate(-1)
              } else {
                navigate('/viewer')
              }
            }}
            disabled={!selectedDoc}
            aria-label="Viewer"
          >
            <FileText size={22} />
          </button>
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
            <Rewind size={22} />
          </button>
          <button className="gpc-btn-play" onClick={togglePlay}>
            {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: 2 }} />}
          </button>
          <button className="gpc-btn gpc-btn-skip" onClick={() => skip(skipInterval)}>
            <FastForward size={22} />
          </button>
        </div>

        <div className="gpc-side gpc-side--right">
          <div className="gpc-skip-menu" ref={menuRef}>
            <button className="gpc-skip-label" onClick={() => setMenuOpen(!menuOpen)}>
              {skipInterval}s
            </button>
            {menuOpen && (
              <div className="popup-menu gpc-menu-popup">
                {SKIP_OPTIONS.map((s) => (
                  <button
                    key={s}
                    className={`popup-menu-item gpc-menu-item ${s === skipInterval ? 'active' : ''}`}
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
          <button className="gpc-btn gpc-btn-marker" onClick={addMarker} disabled={markers.length >= 5} aria-label="Marker setzen">
            <MapPin size={32} />
          </button>
        </div>
      </div>
    </div>
  )
}
