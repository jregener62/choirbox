import { useState, useRef, useEffect } from 'react'
import { MoreVertical } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { TopPlayerBar } from '@/components/ui/TopPlayerBar.tsx'
import { formatTime } from '@/utils/formatters.ts'
import type { Marker } from '@/stores/playerStore'

interface PlayerControlsBarProps {
  peaks?: number[]
  markers: Marker[]
}

export function PlayerControlsBar({ peaks, markers }: PlayerControlsBarProps) {
  const { loopStart, loopEnd, loopEnabled, pendingLoopMarkerId, loopMarkerIds } = usePlayerStore()
  const { seek } = useAudioPlayer()
  const lastTappedRef = useRef<string | null>(null)
  const [markerMenuOpen, setMarkerMenuOpen] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const markerMenuRef = useRef<HTMLDivElement>(null)
  const deleteModeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  useEffect(() => {
    if (!markerMenuOpen) return
    const close = (e: MouseEvent) => {
      if (markerMenuRef.current && !markerMenuRef.current.contains(e.target as Node)) setMarkerMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [markerMenuOpen])

  useEffect(() => {
    return () => { if (deleteModeTimer.current) clearTimeout(deleteModeTimer.current) }
  }, [])

  const handleMarkerTap = (m: Marker) => {
    const store = usePlayerStore.getState()
    const isOrange = m.id === store.pendingLoopMarkerId
      || (store.loopMarkerIds && store.loopMarkerIds.includes(m.id))

    // Tap on orange marker → deactivate loop/loop point
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

    // Second tap on same marker → set as loop point
    if (lastTappedRef.current === m.id) {
      lastTappedRef.current = null
      if (store.loopMarkerIds) {
        store.clearLoop()
      }
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

    // First tap → just seek
    lastTappedRef.current = m.id
    seek(m.time)
  }

  return (
    <>
      <TopPlayerBar
        variant="full"
        peaks={peaks}
        loopStart={loopStart}
        loopEnd={loopEnd}
        loopEnabled={loopEnabled}
        markers={markers}
        onSeek={(time) => { seek(time); usePlayerStore.getState().setPlaying(true) }}
      />
      {markers.length > 0 && (
        <div className="player-marker-row">
          <div className="player-marker-row-scroll">
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
              <div className="marker-kebab-popup">
                <button className="marker-kebab-item" onClick={startDeleteMode}>Marker loeschen</button>
                <button className="marker-kebab-item" onClick={() => { usePlayerStore.getState().clearMarkers(); setMarkerMenuOpen(false); setDeleteMode(false) }}>Alle Marker loeschen</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
