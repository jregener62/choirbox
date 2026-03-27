import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Rewind, FastForward, Play, Pause } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useDoubleTap } from '@/hooks/useDoubleTap.ts'

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

      {/* Centered controls */}
      <div className="top-player-controls">
        <button className="top-player-skip" onClick={(e) => { e.stopPropagation(); skipBack() }}>
          <Rewind size={16} />
          <span>{skipInterval}s</span>
        </button>
        <button className="top-player-play" onClick={(e) => { e.stopPropagation(); togglePlay() }}>
          {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
        </button>
        <button className="top-player-skip" onClick={(e) => { e.stopPropagation(); skipFwd() }}>
          <span>{skipInterval}s</span>
          <FastForward size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div className="top-player-progress">
        <div className="top-player-progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}
