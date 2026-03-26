import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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

  // Dropbox connect via OAuth popup
  const connectDropbox = useCallback(async () => {
    try {
      const data = await api<{ authorize_url: string }>('/dropbox/authorize')

      const w = 600
      const h = 700
      const left = window.screenX + (window.outerWidth - w) / 2
      const top = window.screenY + (window.outerHeight - h) / 2
      const popup = window.open(
        data.authorize_url,
        'dropbox_oauth',
        `width=${w},height=${h},left=${left},top=${top}`,
      )

      if (!popup) {
        setMessage('Popup wurde blockiert. Bitte Popups fuer diese Seite erlauben.')
        return
      }

      // Listen for postMessage from OAuth callback
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'dropbox-oauth') {
          window.removeEventListener('message', handler)
          if (event.data.success) {
            setMessage('Dropbox verbunden!')
            loadDropboxStatus()
          } else {
            setMessage('Dropbox-Verbindung fehlgeschlagen.')
          }
        }
      }
      window.addEventListener('message', handler)

      // Poll for popup close
      const interval = setInterval(() => {
        if (popup.closed) {
          clearInterval(interval)
          window.removeEventListener('message', handler)
          loadDropboxStatus()
        }
      }, 500)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'OAuth-Start fehlgeschlagen')
    }
  }, [loadDropboxStatus])

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
          <h3 className="settings-heading">Profil</h3>
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
          <h3 className="settings-heading">Darstellung</h3>
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
            <h3 className="settings-heading">Dropbox</h3>
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
                  <span>{dbxStatus.account_email}</span>
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
                <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Dropbox ist nicht verbunden. Verbinde den Dropbox-Account, damit Chormitglieder auf die Dateien zugreifen koennen.
                </div>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={connectDropbox}>
                  Mit Dropbox verbinden
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 14, color: 'var(--danger)' }}>
                Dropbox-Credentials nicht konfiguriert. DROPBOX_APP_KEY und DROPBOX_APP_SECRET in .env eintragen.
              </div>
            )}
          </section>
        )}

        {/* -- Registrierungscode (Admin) -- */}
        {isAdmin && (
          <section>
            <h3 className="settings-heading">Registrierungscode</h3>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
              Diesen Code an Chormitglieder weitergeben, damit sie sich registrieren koennen.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                type="text"
                value={regCode}
                onChange={(e) => setRegCode(e.target.value)}
                placeholder="z.B. MeinChor2026"
              />
              <button
                className="btn btn-primary"
                onClick={saveRegCode}
                disabled={regCodeSaving}
                style={{ whiteSpace: 'nowrap' }}
              >
                {regCodeSaving ? '...' : 'Speichern'}
              </button>
            </div>
          </section>
        )}

        {/* -- Nutzerverwaltung (Admin) -- */}
        {isAdmin && (
          <section>
            <h3 className="settings-heading">Verwaltung</h3>
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => navigate('/admin/users')}
            >
              Nutzer verwalten
            </button>
          </section>
        )}

        {/* -- Abmelden -- */}
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
