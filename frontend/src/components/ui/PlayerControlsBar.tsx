import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { TopPlayerBar } from '@/components/ui/TopPlayerBar.tsx'
import { MarkerRow } from '@/components/ui/MarkerRow.tsx'
import type { Marker } from '@/stores/playerStore'

interface PlayerControlsBarProps {
  peaks?: number[]
  markers: Marker[]
}

export function PlayerControlsBar({ peaks, markers }: PlayerControlsBarProps) {
  const { loopStart, loopEnd, loopEnabled } = usePlayerStore()
  const { seek } = useAudioPlayer()

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
      <MarkerRow markers={markers} variant="full" />
    </>
  )
}
