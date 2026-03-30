import { X, Trash2 } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { TopPlayerBar } from '@/components/ui/TopPlayerBar.tsx'
import { formatTime } from '@/utils/formatters.ts'
import type { TimelineEntry } from '@/utils/buildTimeline'
import type { Marker } from '@/stores/playerStore'

interface PlayerControlsBarProps {
  peaks?: number[]
  timeline: TimelineEntry[]
  markers: Marker[]
}

export function PlayerControlsBar({ peaks, timeline, markers }: PlayerControlsBarProps) {
  const { loopStart, loopEnd, loopEnabled, pendingLoopMarkerId } = usePlayerStore()
  const { seek } = useAudioPlayer()

  const handleMarkerTap = (m: Marker) => {
    const store = usePlayerStore.getState()
    if (!store.pendingLoopMarkerId) {
      store.setPendingLoopMarker(m.id)
      seek(m.time)
    } else if (store.pendingLoopMarkerId === m.id) {
      store.setPendingLoopMarker(null)
      seek(m.time)
    } else {
      const pendingMarker = markers.find((mk) => mk.id === store.pendingLoopMarkerId)
      if (pendingMarker) {
        store.createLoopFromMarkers(pendingMarker, m)
        const earlier = pendingMarker.time <= m.time ? pendingMarker : m
        seek(earlier.time)
      }
    }
  }

  return (
    <>
      <TopPlayerBar
        variant="full"
        peaks={peaks}
        loopStart={loopStart}
        loopEnd={loopEnd}
        loopEnabled={loopEnabled}
        timeline={timeline}
        markers={markers}
        onSeek={(time) => { seek(time); usePlayerStore.getState().setPlaying(true) }}
      />
      {markers.length > 0 && (
        <div className="player-marker-row">
          {markers.map((m) => (
            <button
              key={m.id}
              className={`player-toolbar-marker${m.id === pendingLoopMarkerId ? ' player-toolbar-marker--pending' : ''}`}
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
