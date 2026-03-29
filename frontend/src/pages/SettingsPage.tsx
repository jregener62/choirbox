import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { User, Sun, Moon, Cloud, CloudOff, Hash, Users, Tag, LayoutList, LogOut, ChevronRight, ChevronLeft, Pencil, Lock, Check, X } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import { useAppStore } from '@/stores/appStore.ts'
import { api } from '@/api/client.ts'
import { hasMinRole, ROLE_LABELS, type Role } from '@/utils/roles.ts'

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
  const isAdmin = hasMinRole(user?.role ?? 'guest', 'admin')
  const isProMember = hasMinRole(user?.role ?? 'guest', 'pro-member')

  // Profile edit state
  const [editingProfile, setEditingProfile] = useState(false)
  const [editName, setEditName] = useState(user?.display_name || '')
  const [editVoice, setEditVoice] = useState(user?.voice_part || '')

  // Password change state
  const [changingPw, setChangingPw] = useState(false)
  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')

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
  // Save profile
  const saveProfile = async () => {
    try {
      await api('/auth/me', { method: 'PUT', body: { display_name: editName, voice_part: editVoice } })
      // Update local store
      const updatedUser = { ...user!, display_name: editName, voice_part: editVoice }
      localStorage.setItem('choirbox_user', JSON.stringify(updatedUser))
      useAuthStore.setState({ user: updatedUser })
      setEditingProfile(false)
      setMessage('Profil aktualisiert')
    } catch {
      setMessage('Fehler beim Speichern')
    }
  }

  // Change password
  const changePassword = async () => {
    if (newPw !== newPwConfirm) {
      setMessage('Passwoerter stimmen nicht ueberein')
      return
    }
    if (newPw.length < 4) {
      setMessage('Passwort muss mindestens 4 Zeichen haben')
      return
    }
    try {
      await api('/auth/me/password', { method: 'PUT', body: { old_password: oldPw, new_password: newPw } })
      setChangingPw(false)
      setOldPw('')
      setNewPw('')
      setNewPwConfirm('')
      setMessage('Passwort geaendert')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Fehler beim Aendern')
    }
  }

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
        <button className="topbar-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={22} />
        </button>
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 className="settings-heading" style={{ marginBottom: 0 }}><User size={14} /> Profil</h3>
            {!editingProfile && (
              <button className="player-header-btn" onClick={() => { setEditName(user?.display_name || ''); setEditVoice(user?.voice_part || ''); setEditingProfile(true) }}>
                <Pencil size={16} />
              </button>
            )}
          </div>
          {editingProfile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <div className="auth-field">
                <label className="auth-label">Anzeigename</label>
                <input className="auth-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="auth-field">
                <label className="auth-label">Stimmgruppe</label>
                <div className="voice-part-selector">
                  {['Sopran', 'Alt', 'Tenor', 'Bass'].map((part) => (
                    <button key={part} type="button"
                      className={`voice-part-btn ${editVoice === part ? 'selected' : ''}`}
                      onClick={() => setEditVoice(part)}
                    >{part}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="auth-submit" style={{ flex: 1 }} onClick={saveProfile}>
                  <Check size={16} style={{ marginRight: 4 }} /> Speichern
                </button>
                <button className="btn btn-secondary" onClick={() => setEditingProfile(false)}>
                  <X size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="settings-rows" style={{ marginTop: 12 }}>
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
                <span>{ROLE_LABELS[user?.role as Role] ?? user?.role}</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Stimmgruppe</span>
                <span>{user?.voice_part}</span>
              </div>
            </div>
          )}
        </section>

        {/* -- Passwort -- */}
        <section>
          <h3 className="settings-heading"><Lock size={14} /> Passwort</h3>
          {changingPw ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="auth-field">
                <label className="auth-label">Aktuelles Passwort</label>
                <input className="auth-input" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
              </div>
              <div className="auth-field">
                <label className="auth-label">Neues Passwort</label>
                <input className="auth-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              </div>
              <div className="auth-field">
                <label className="auth-label">Neues Passwort wiederholen</label>
                <input className="auth-input" type="password" value={newPwConfirm} onChange={(e) => setNewPwConfirm(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="auth-submit" style={{ flex: 1 }} onClick={changePassword}>
                  Passwort aendern
                </button>
                <button className="btn btn-secondary" onClick={() => { setChangingPw(false); setOldPw(''); setNewPw(''); setNewPwConfirm('') }}>
                  <X size={16} />
                </button>
              </div>
            </div>
          ) : (
            <button className="settings-nav-item" onClick={() => setChangingPw(true)}>
              <Lock size={18} />
              <span>Passwort aendern</span>
              <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
            </button>
          )}
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

        {/* -- Verwaltung (Pro-Mitglied+) -- */}
        {isProMember && (
          <section>
            <h3 className="settings-heading">Verwaltung</h3>
            <div className="settings-nav-list">
              {isAdmin && (
                <button className="settings-nav-item" onClick={() => navigate('/admin/users')}>
                  <Users size={18} />
                  <span>Nutzer verwalten</span>
                  <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
                </button>
              )}
              <button className="settings-nav-item" onClick={() => navigate('/admin/labels')}>
                <Tag size={18} />
                <span>Labels verwalten</span>
                <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
              </button>
              <button className="settings-nav-item" onClick={() => navigate('/admin/section-presets')}>
                <LayoutList size={18} />
                <span>Sektionsvorlagen</span>
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
