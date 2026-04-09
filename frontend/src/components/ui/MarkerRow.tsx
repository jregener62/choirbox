import { useState, useRef } from 'react'
import { Trash2, ListX, X } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { formatTime } from '@/utils/formatters.ts'
import type { Marker } from '@/stores/playerStore'

interface MarkerRowProps {
  markers: Marker[]
  variant: 'global' | 'full'
}

export function MarkerRow({ markers, variant }: MarkerRowProps) {
  const { pendingLoopMarkerId, loopMarkerIds } = usePlayerStore()
  const { seek } = useAudioPlayer()
  const [deleteMode, setDeleteMode] = useState(false)
  const lastTappedRef = useRef<string | null>(null)

  if (markers.length === 0) return null

  const handleDeleteMarker = (id: string) => {
    usePlayerStore.getState().removeMarker(id)
  }

  const handleClearAll = () => {
    usePlayerStore.getState().clearMarkers()
    setDeleteMode(false)
  }

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

  const outerClass = variant === 'global' ? 'global-player-markers' : 'player-marker-row'
  const scrollClass = variant === 'global' ? 'global-player-markers-scroll' : 'player-marker-row-scroll'

  return (
    <div className={outerClass}>
      {deleteMode && (
        <button
          className="marker-clear-all-btn"
          onClick={handleClearAll}
          aria-label="Alle Marker löschen"
        >
          <ListX size={16} />
        </button>
      )}
      <div className={scrollClass}>
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
              {deleteMode && <X size={14} className="player-toolbar-marker-x" />}
            </button>
          )
        })}
      </div>
      <button
        className={`marker-delete-toggle${deleteMode ? ' marker-delete-toggle--active' : ''}`}
        onClick={() => setDeleteMode(!deleteMode)}
        aria-label={deleteMode ? 'Lösch-Modus beenden' : 'Lösch-Modus'}
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}
