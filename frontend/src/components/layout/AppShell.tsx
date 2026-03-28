import { useLocation, useNavigate } from 'react-router-dom'
import { FolderOpen, Heart, Settings } from 'lucide-react'

export function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()

  const navItems = [
    { path: '/browse', icon: FolderOpen, label: 'Dateien' },
    { path: '/favorites', icon: Heart, label: 'Favoriten' },
    { path: '/settings', icon: Settings, label: 'Einstellungen' },
  ]

  const hidePlayer = location.pathname === '/player' || location.pathname === '/sections'

  return (
    <div className="app-shell">
      <div className="main-content">
        {children}
      </div>

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
                <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} />
                <span className="bottom-nav-label">{item.label}</span>
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
