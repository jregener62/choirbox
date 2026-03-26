import { useAuthStore } from '@/stores/authStore.ts'
import { useAppStore } from '@/stores/appStore.ts'

export function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { theme, toggleTheme } = useAppStore()

  return (
    <div>
      <div className="topbar">
        <div className="topbar-title">Einstellungen</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <section>
          <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>Profil</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Name</span>
              <span>{user?.display_name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Benutzername</span>
              <span>{user?.username}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Rolle</span>
              <span>{user?.role === 'admin' ? 'Admin' : 'Mitglied'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Stimmgruppe</span>
              <span>{user?.voice_part}</span>
            </div>
          </div>
        </section>

        <section>
          <h3 style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>Darstellung</h3>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Theme</span>
            <button className="btn btn-secondary" onClick={toggleTheme}>
              {theme === 'dark' ? 'Hell' : 'Dunkel'}
            </button>
          </div>
        </section>

        <section>
          <button
            className="btn btn-secondary"
            style={{ width: '100%', color: 'var(--danger)' }}
            onClick={logout}
          >
            Abmelden
          </button>
        </section>
      </div>
    </div>
  )
}
