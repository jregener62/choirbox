import { Repeat, X, Trash2 } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useLoopControls } from '@/hooks/useLoopControls.ts'
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
  const { loopStart, loopEnd, loopEnabled } = usePlayerStore()
  const { seek } = useAudioPlayer()
  const { setA, setB, handleLoopTap } = useLoopControls()

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
      <div className="player-toolbar">
        <button
          className={`player-toolbar-btn player-toolbar-btn--wide ${loopStart !== null ? 'player-toolbar-btn--amber' : ''}`}
          onClick={setA}
        >
          <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>[</span>
          {loopStart !== null && <span className="player-toolbar-btn-time">{formatTime(loopStart)}</span>}
        </button>
        <button
          className={`player-toolbar-btn player-toolbar-btn--narrow ${loopEnabled ? 'player-toolbar-btn--amber' : ''}`}
          onClick={handleLoopTap}
          disabled={loopStart === null || loopEnd === null}
        >
          <Repeat size={16} />
        </button>
        <button
          className={`player-toolbar-btn player-toolbar-btn--wide ${loopEnd !== null ? 'player-toolbar-btn--amber' : ''}`}
          onClick={setB}
        >
          {loopEnd !== null && <span className="player-toolbar-btn-time">{formatTime(loopEnd)}</span>}
          <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>]</span>
        </button>
      </div>
      {markers.length > 0 && (
        <div className="player-marker-row">
          {markers.map((m) => (
            <button key={m.id} className="player-toolbar-marker" onClick={() => seek(m.time)}>
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
