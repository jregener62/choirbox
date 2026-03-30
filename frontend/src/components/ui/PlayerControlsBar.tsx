import { useRef } from 'react'
import { X, Trash2 } from 'lucide-react'
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
    </>
  )
}
