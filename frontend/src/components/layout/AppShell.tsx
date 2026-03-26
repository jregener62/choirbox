import { useLocation, useNavigate } from 'react-router-dom'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { formatTime } from '@/utils/formatters.ts'

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentName, isPlaying, currentTime, duration } = usePlayerStore()
  const { togglePlay } = useAudioPlayer()

  const navItems = [
    { path: '/browse', icon: '\uD83D\uDCC2', label: 'Dateien' },
    { path: '/favorites', icon: '\u2764\uFE0F', label: 'Favoriten' },
    { path: '/settings', icon: '\u2699\uFE0F', label: 'Einstellungen' },
  ]

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const onPlayerPage = location.pathname === '/player'

  return (
    <div className="app-shell">
      <div className="main-content">
        {children}
      </div>

      {currentName && !onPlayerPage && (
        <div className="mini-player" onClick={() => navigate('/player')}>
          <button
            className="btn-icon"
            style={{ color: 'var(--player-text)' }}
            onClick={(e) => {
              e.stopPropagation()
              togglePlay()
            }}
          >
            {isPlaying ? '\u23F8' : '\u25B6'}
          </button>
          <div className="mini-player-info">
            <div className="mini-player-title">{currentName}</div>
            <div className="mini-player-progress">
              <div
                className="mini-player-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>
            {formatTime(currentTime)}
          </div>
        </div>
      )}

      {!onPlayerPage && <nav className="bottom-nav">
        {navItems.map((item) => (
          <button
            key={item.path}
            className={`bottom-nav-item ${location.pathname === item.path || (item.path === '/browse' && location.pathname === '/') ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>}
    </div>
  )
}
