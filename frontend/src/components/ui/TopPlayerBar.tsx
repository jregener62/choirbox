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

export function TopPlayerBar({ variant, onBack, title }: TopPlayerBarProps) {
  const navigate = useNavigate()
  const {
    currentName, currentPath,
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
  const folderPath = currentPath?.split('/').slice(0, -1).join('/') || ''
  const isFull = variant === 'full'

  return (
    <div className={`top-player-bar ${isFull ? 'top-player-bar--full' : ''}`}>
      {/* Left: back button or clickable track info */}
      {isFull && onBack ? (
        <button className="top-player-back" onClick={onBack}>
          <ChevronDown size={22} />
        </button>
      ) : null}

      <div
        className={`top-player-info ${isFull ? 'top-player-info--full' : ''}`}
        onClick={!isFull ? () => navigate('/player') : undefined}
      >
        {isFull && title ? (
          <>
            <div className="top-player-title">{currentName}</div>
            <div className="top-player-subtitle">{folderPath} &middot; {formatTime(currentTime)} / {formatTime(duration)}</div>
          </>
        ) : (
          <>
            <div className="top-player-title">{currentName}</div>
            <div className="top-player-subtitle">{formatTime(currentTime)} / {formatTime(duration)}</div>
          </>
        )}
      </div>

      {/* Right: controls */}
      <div className="top-player-controls">
        <button className="top-player-skip" onClick={skipBack}>
          <Rewind size={16} />
          <span>{skipInterval}s</span>
        </button>
        <button className="top-player-play" onClick={togglePlay}>
          {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
        </button>
        <button className="top-player-skip" onClick={skipFwd}>
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
