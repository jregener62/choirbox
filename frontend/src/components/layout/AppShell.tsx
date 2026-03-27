import { useLocation, useNavigate } from 'react-router-dom'
import { FolderOpen, Heart, Settings, Play, Pause, Music, ChevronUp } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAppStore } from '@/stores/appStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { formatTime } from '@/utils/formatters.ts'

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentName, isPlaying, currentTime, duration } = usePlayerStore()
  const modalOpen = useAppStore((s) => s.modalOpen)
  const { togglePlay } = useAudioPlayer()

  const navItems = [
    { path: '/browse', icon: FolderOpen, label: 'Dateien' },
    { path: '/favorites', icon: Heart, label: 'Favoriten' },
    { path: '/settings', icon: Settings, label: 'Einstellungen' },
  ]

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const hidePlayer = location.pathname === '/player' || location.pathname === '/sections'

  return (
    <div className="app-shell">
      <div className="main-content">
        {children}
      </div>

      {currentName && !hidePlayer && !modalOpen && (
        <div className="mini-player" onClick={() => navigate('/player')}>
          <div className="mini-player-icon">
            <Music size={16} />
          </div>
          <div className="mini-player-info">
            <div className="mini-player-title">{currentName}</div>
            <div className="mini-player-time">{formatTime(currentTime)}</div>
          </div>
          <button
            className="mini-player-btn"
            onClick={(e) => { e.stopPropagation(); togglePlay() }}
          >
            {isPlaying ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button
            className="mini-player-expand"
            onClick={() => navigate('/player')}
          >
            <ChevronUp size={20} />
          </button>
          <div className="mini-player-progress">
            <div className="mini-player-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {!hidePlayer && (
        <nav className="bottom-nav">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path ||
              (item.path === '/browse' && location.pathname === '/')
            const Icon = item.icon
            return (
              <button
                key={item.path}
                className={`bottom-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="bottom-nav-label">{item.label}</span>
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
