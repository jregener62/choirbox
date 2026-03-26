import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { User, Sun, Moon, Cloud, CloudOff, Hash, Users, Tag, LogOut, ChevronRight } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import { useAppStore } from '@/stores/appStore.ts'
import { api } from '@/api/client.ts'

interface DropboxStatus {
  connected: boolean
  configured: boolean
  account_email: string | null
  account_id: string | null
}

interface AdminSettings {
  registration_code: string | null
  dropbox_root_folder: string | null
}

export function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { theme, toggleTheme } = useAppStore()
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = user?.role === 'admin'

  // Dropbox state
  const [dbxStatus, setDbxStatus] = useState<DropboxStatus | null>(null)
  const [dbxLoading, setDbxLoading] = useState(false)

  // Admin settings
  const [regCode, setRegCode] = useState('')
  const [regCodeSaving, setRegCodeSaving] = useState(false)
  const [message, setMessage] = useState('')

  // Load Dropbox status
  const loadDropboxStatus = useCallback(async () => {
    setDbxLoading(true)
    try {
      const status = await api<DropboxStatus>('/dropbox/status')
      setDbxStatus(status)
    } catch {
      // not connected or not configured
    } finally {
      setDbxLoading(false)
    }
  }, [])

  // Load admin settings
  const loadAdminSettings = useCallback(async () => {
    if (!isAdmin) return
    try {
      const settings = await api<AdminSettings>('/admin/settings')
      setRegCode(settings.registration_code || '')
    } catch {
      // ignore
    }
  }, [isAdmin])

  useEffect(() => {
    loadDropboxStatus()
    loadAdminSettings()
  }, [loadDropboxStatus, loadAdminSettings])

  // Show success message after OAuth redirect back
  useEffect(() => {
    if (location.search?.includes('dropbox=connected')) {
      setMessage('Dropbox verbunden!')
      // Clean up URL
      navigate('/settings', { replace: true })
    }
  }, [location.search, navigate])

  // Dropbox connect — redirect-based (no popup blocking issues)
  const connectDropbox = useCallback(async () => {
    try {
      const data = await api<{ authorize_url: string }>('/dropbox/authorize')
      // Redirect the whole page to Dropbox OAuth
      // After authorization, Dropbox redirects to /api/dropbox/callback
      // which shows a success page and auto-closes
      window.location.href = data.authorize_url
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'OAuth-Start fehlgeschlagen')
    }
  }, [])

  // Dropbox disconnect
  const disconnectDropbox = useCallback(async () => {
    if (!confirm('Dropbox wirklich trennen?')) return
    try {
      await api('/dropbox/disconnect', { method: 'POST' })
      setMessage('Dropbox getrennt')
      setDbxStatus(null)
      loadDropboxStatus()
    } catch {
      setMessage('Fehler beim Trennen')
    }
  }, [loadDropboxStatus])

  // Save registration code
  const saveRegCode = async () => {
    setRegCodeSaving(true)
    try {
      await api('/admin/settings', { method: 'PUT', body: { registration_code: regCode } })
      setMessage('Registrierungscode gespeichert')
    } catch {
      setMessage('Fehler beim Speichern')
    } finally {
      setRegCodeSaving(false)
    }
  }

  return (
    <div>
      <div className="topbar">
        <div className="topbar-title">Einstellungen</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Status message */}
        {message && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'var(--bg-tertiary)',
              fontSize: 14,
            }}
            onClick={() => setMessage('')}
          >
            {message}
          </div>
        )}

        {/* -- Profil -- */}
        <section>
          <h3 className="settings-heading"><User size={14} /> Profil</h3>
          <div className="settings-rows">
            <div className="settings-row">
              <span className="settings-label">Name</span>
              <span>{user?.display_name}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Benutzername</span>
              <span>{user?.username}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Rolle</span>
              <span>{isAdmin ? 'Admin' : 'Mitglied'}</span>
            </div>
            <div className="settings-row">
              <span className="settings-label">Stimmgruppe</span>
              <span>{user?.voice_part}</span>
            </div>
          </div>
        </section>

        {/* -- Darstellung -- */}
        <section>
          <h3 className="settings-heading">{theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />} Darstellung</h3>
          <div className="settings-row">
            <span>Theme</span>
            <button className="btn btn-secondary" onClick={toggleTheme}>
              {theme === 'dark' ? 'Hell' : 'Dunkel'}
            </button>
          </div>
        </section>

        {/* -- Dropbox (Admin) -- */}
        {isAdmin && (
          <section>
            <h3 className="settings-heading">{dbxStatus?.connected ? <Cloud size={14} /> : <CloudOff size={14} />} Dropbox</h3>
            {dbxLoading ? (
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Lade Status...</div>
            ) : dbxStatus?.connected ? (
              <div className="settings-rows">
                <div className="settings-row">
                  <span className="settings-label">Status</span>
                  <span style={{ color: 'var(--success)' }}>Verbunden</span>
                </div>
                <div className="settings-row">
                  <span className="settings-label">Account</span>
                  <span style={{ fontSize: 13 }}>{dbxStatus.account_email}</span>
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: 8, color: 'var(--danger)' }}
                  onClick={disconnectDropbox}
                >
                  Dropbox trennen
                </button>
              </div>
            ) : dbxStatus?.configured ? (
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Verbinde den Dropbox-Account, damit Chormitglieder auf die Dateien zugreifen koennen.
                </div>
                <button className="auth-submit" onClick={connectDropbox}>
                  Mit Dropbox verbinden
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--danger)' }}>
                DROPBOX_APP_KEY und DROPBOX_APP_SECRET in .env eintragen.
              </div>
            )}
          </section>
        )}

        {/* -- Registrierungscode (Admin) -- */}
        {isAdmin && (
          <section>
            <h3 className="settings-heading"><Hash size={14} /> Registrierungscode</h3>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              Diesen Code an Chormitglieder weitergeben.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="auth-input"
                type="text"
                value={regCode}
                onChange={(e) => setRegCode(e.target.value)}
                placeholder="z.B. MeinChor2026"
              />
              <button
                className="auth-submit"
                onClick={saveRegCode}
                disabled={regCodeSaving}
                style={{ width: 'auto', padding: '10px 20px' }}
              >
                {regCodeSaving ? '...' : 'OK'}
              </button>
            </div>
          </section>
        )}

        {/* -- Verwaltung (Admin) -- */}
        {isAdmin && (
          <section>
            <h3 className="settings-heading">Verwaltung</h3>
            <div className="settings-nav-list">
              <button className="settings-nav-item" onClick={() => navigate('/admin/users')}>
                <Users size={18} />
                <span>Nutzer verwalten</span>
                <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
              </button>
              <button className="settings-nav-item" onClick={() => navigate('/admin/labels')}>
                <Tag size={18} />
                <span>Labels verwalten</span>
                <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
              </button>
            </div>
          </section>
        )}

        {/* -- Abmelden -- */}
        <section>
          <button className="settings-nav-item" style={{ color: 'var(--danger)' }} onClick={logout}>
            <LogOut size={18} />
            <span>Abmelden</span>
          </button>
        </section>
      </div>
    </div>
  )
}
