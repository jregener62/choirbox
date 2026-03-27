import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Rewind, FastForward, Play, Pause } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useDoubleTap } from '@/hooks/useDoubleTap.ts'
import { formatTime } from '@/utils/formatters.ts'

interface TopPlayerBarProps {
  variant: 'mini' | 'full'
  onBack?: () => void
  title?: string
}

export function TopPlayerBar({ variant, onBack }: TopPlayerBarProps) {
  const navigate = useNavigate()
  const {
    currentName,
    isPlaying, currentTime, duration,
    skipInterval,
  } = usePlayerStore()
  const { togglePlay, skip } = useAudioPlayer()

  const cycleInterval = useCallback(() => usePlayerStore.getState().cycleSkipInterval(), [])
  const skipBack = useDoubleTap(
    useCallback(() => skip(-skipInterval), [skip, skipInterval]),
    cycleInterval,
  )
  const skipFwd = useDoubleTap(
    useCallback(() => skip(skipInterval), [skip, skipInterval]),
    cycleInterval,
  )

  if (!currentName) return null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const isFull = variant === 'full'

  return (
    <div
      className={`top-player-bar ${isFull ? 'top-player-bar--full' : ''}`}
      onClick={!isFull ? () => navigate('/player') : undefined}
    >
      {isFull && onBack ? (
        <button className="top-player-back" onClick={onBack}>
          <ChevronDown size={22} />
        </button>
      ) : null}

      {/* Time + Controls */}
      <span className="top-player-time">{formatTime(currentTime)}</span>
      <div className="top-player-controls">
        <button className="top-player-skip" onClick={(e) => { e.stopPropagation(); skipBack() }}>
          <Rewind size={18} />
          <span>{skipInterval}s</span>
        </button>
        <button className="top-player-play" onClick={(e) => { e.stopPropagation(); togglePlay() }}>
          {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: 2 }} />}
        </button>
        <button className="top-player-skip" onClick={(e) => { e.stopPropagation(); skipFwd() }}>
          <span>{skipInterval}s</span>
          <FastForward size={18} />
        </button>
      </div>
      <span className="top-player-time">{formatTime(duration)}</span>

      {/* Progress bar */}
      <div className="top-player-progress">
        <div className="top-player-progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}
