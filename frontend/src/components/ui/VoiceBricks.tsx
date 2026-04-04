import { Volume2 } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useSiblingTracks } from '@/hooks/useSiblingTracks.ts'
import { voiceColor, voiceBg, voiceFullName } from '@/utils/voiceColors.ts'
import { formatTime, formatDisplayName } from '@/utils/formatters.ts'

export function VoiceBricks() {
  const currentPath = usePlayerStore((s) => s.currentPath)
  const tracks = useSiblingTracks()

  if (tracks.length <= 1) return null

  const handleClick = (track: typeof tracks[0]) => {
    if (track.path !== currentPath) {
      usePlayerStore.getState().setTrack(track.path, track.name)
    }
    usePlayerStore.getState().setPlaying(true)
  }

  const activeIndex = tracks.findIndex((t) => t.path === currentPath)

  return (
    <div className="voice-bricks-wrap">
      <div className="voice-bricks">
        {tracks.map((track) => {
          const isActive = track.path === currentPath
          const vk = track.voiceKey
          const color = vk ? voiceColor(vk) : 'var(--text2)'
          const bg = vk ? voiceBg(vk) : 'rgba(148,163,184,0.1)'
          const label = vk ? voiceFullName(vk) : formatDisplayName(track.name)

          return (
            <button
              key={track.path}
              className={`voice-brick${isActive ? ' voice-brick--active' : ''}`}
              style={{
                background: isActive ? bg.replace('0.15', '0.25') : bg,
                color,
                borderColor: isActive ? color : 'transparent',
              }}
              onClick={() => handleClick(track)}
            >
              {isActive && <Volume2 size={14} style={{ flexShrink: 0 }} />}
              <span className="voice-brick-content">
                <span className="voice-brick-label">{label}</span>
                {track.duration != null && (
                  <span className="voice-brick-duration">{formatTime(track.duration)}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
      <div className="voice-bricks-dots">
        {tracks.map((_, i) => (
          <span key={i} className={`voice-bricks-dot${i === activeIndex ? ' voice-bricks-dot--active' : ''}`} />
        ))}
      </div>
    </div>
  )
}
