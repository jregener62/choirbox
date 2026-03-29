import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Rewind, FastForward, Play, Pause, MoreVertical } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { MiniWaveform } from '@/components/ui/MiniWaveform.tsx'
import { formatTime } from '@/utils/formatters.ts'
import type { TimelineEntry } from '@/utils/buildTimeline'
import type { Marker } from '@/stores/playerStore'

const SKIP_OPTIONS = [1, 5, 10, 15] as const

interface TopPlayerBarProps {
  variant: 'mini' | 'full'
  peaks?: number[]
  timeline?: TimelineEntry[]
  markers?: Marker[]
  onSeek?: (time: number) => void
}

export function TopPlayerBar({ variant, peaks, timeline, markers, onSeek }: TopPlayerBarProps) {
  const navigate = useNavigate()
  const {
    currentName,
    isPlaying, currentTime, duration,
    skipInterval,
  } = usePlayerStore()
  const { togglePlay, skip } = useAudioPlayer()

  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  if (!currentName) return null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const isFull = variant === 'full'
  const hasWaveform = peaks && peaks.length > 0 && onSeek

  return (
    <div
      className={`top-player-bar ${isFull ? 'top-player-bar--full' : ''}`}
      onClick={!isFull ? () => navigate('/player') : undefined}
    >
      {/* Time + Controls */}
      <span className="top-player-time">{formatTime(currentTime)}</span>
      <div className="top-player-controls">
        <button className="top-player-skip" onClick={(e) => { e.stopPropagation(); skip(-skipInterval) }}>
          <Rewind size={18} />
          <span>{skipInterval}s</span>
        </button>
        <button className="top-player-play" onClick={(e) => { e.stopPropagation(); togglePlay() }}>
          {isPlaying ? <Pause size={24} /> : <Play size={24} style={{ marginLeft: 2 }} />}
        </button>
        <button className="top-player-skip" onClick={(e) => { e.stopPropagation(); skip(skipInterval) }}>
          <span>{skipInterval}s</span>
          <FastForward size={18} />
        </button>
      </div>
      <span className="top-player-time">{formatTime(duration)}</span>

      {/* Skip interval menu */}
      <div className="top-player-menu" ref={menuRef}>
        <button
          className="top-player-menu-btn"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen) }}
          aria-label="Skip-Zeit ändern"
        >
          <MoreVertical size={18} />
        </button>
        {menuOpen && (
          <div className="top-player-menu-popup">
            {SKIP_OPTIONS.map((s) => (
              <button
                key={s}
                className={`top-player-menu-item ${s === skipInterval ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  usePlayerStore.getState().setSkipInterval(s)
                  setMenuOpen(false)
                }}
              >
                {s}s
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Waveform progress or simple progress bar */}
      {hasWaveform ? (
        <MiniWaveform
          peaks={peaks}
          currentTime={currentTime}
          duration={duration}
          timeline={timeline}
          markers={markers}
          onSeek={onSeek}
        />
      ) : (
        <div className="top-player-progress">
          <div className="top-player-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )
}
