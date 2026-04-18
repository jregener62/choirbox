import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Sun, Moon, Users, Tag, LayoutList, LogOut, ChevronRight, ChevronLeft, Pencil, Lock, Check, X, Music, RefreshCw, Link, Database, Building2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import { useAppStore, ZOOM_LABELS, type ZoomLevel } from '@/stores/appStore.ts'
import { api } from '@/api/client.ts'
import { hasMinRole, ROLE_LABELS, type Role } from '@/utils/roles.ts'
import { useLabelsStore } from '@/hooks/useLabels.ts'
import {
  PasswordStrengthMeter,
  evaluatePassword,
  MIN_PASSWORD_LENGTH,
} from '@/components/ui/PasswordStrengthMeter.tsx'

export function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { theme, setTheme, zoomLevel, setZoomLevel } = useAppStore()
  const navigate = useNavigate()
  const isAdmin = hasMinRole(user?.role ?? 'guest', 'admin')
  const isDeveloper = hasMinRole(user?.role ?? 'guest', 'developer')
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

  const [message, setMessage] = useState('')

  const saveProfile = async () => {
    try {
      await api('/auth/me', { method: 'PUT', body: { display_name: editName, voice_part: editVoice } })
      const updatedUser = { ...user!, display_name: editName, voice_part: editVoice }
      localStorage.setItem('choirbox_user', JSON.stringify(updatedUser))
      useAuthStore.setState({ user: updatedUser })
      setEditingProfile(false)
      setMessage('Profil aktualisiert')
    } catch {
      setMessage('Fehler beim Speichern')
    }
  }

  const newPwCheck = evaluatePassword(newPw, [user?.username || '', user?.display_name || ''])

  const changePassword = async () => {
    if (!newPwCheck.acceptable) {
      setMessage(
        newPwCheck.tooShort
          ? `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben`
          : 'Passwort ist zu schwach'
      )
      return
    }
    if (newPw !== newPwConfirm) {
      setMessage('Passwoerter stimmen nicht ueberein')
      return
    }
    try {
      await api('/auth/me/password', { method: 'PUT', body: { old_password: oldPw, new_password: newPw } })
      setChangingPw(false)
      setOldPw('')
      setNewPw('')
      setNewPwConfirm('')
      setMessage('Passwort geaendert')
      if (user?.must_change_password) {
        const updatedUser = { ...user, must_change_password: false }
        localStorage.setItem('choirbox_user', JSON.stringify(updatedUser))
        useAuthStore.setState({ user: updatedUser })
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Fehler beim Aendern')
    }
  }

  return (
    <div>
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate('/')}>
          <ChevronLeft size={22} />
        </button>
        <div className="topbar-title">Einstellungen</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>

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
                  {useLabelsStore.getState().labels.filter((l) => l.category === 'Stimme').map((l) => (
                    <button key={l.id} type="button"
                      className={`voice-part-btn ${editVoice === l.name ? 'selected' : ''}`}
                      onClick={() => setEditVoice(l.name)}
                    >{l.name}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveProfile}>
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
              {user?.choir_name && (
                <div className="settings-row">
                  <span className="settings-label">Chor</span>
                  <span>{user.choir_name}</span>
                </div>
              )}
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
                <input className="auth-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
                <PasswordStrengthMeter
                  password={newPw}
                  userInputs={[user?.username || '', user?.display_name || '']}
                />
              </div>
              <div className="auth-field">
                <label className="auth-label">Neues Passwort wiederholen</label>
                <input className="auth-input" type="password" value={newPwConfirm} onChange={(e) => setNewPwConfirm(e.target.value)} autoComplete="new-password" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={changePassword}
                  disabled={!newPwCheck.acceptable || newPw !== newPwConfirm || !oldPw}
                >
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
          <div className="settings-rows">
            <div className="settings-row">
              <span>Theme</span>
              <div className="zoom-selector">
                <button
                  className={`zoom-btn ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => setTheme('light')}
                >
                  Hell
                </button>
                <button
                  className={`zoom-btn ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setTheme('dark')}
                >
                  Dunkel
                </button>
              </div>
            </div>
            <div className="settings-row">
              <span>Schriftgroesse</span>
              <div className="zoom-selector">
                {(Object.keys(ZOOM_LABELS) as ZoomLevel[]).map((level) => (
                  <button
                    key={level}
                    className={`zoom-btn ${zoomLevel === level ? 'active' : ''}`}
                    onClick={() => setZoomLevel(level)}
                  >
                    {ZOOM_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* -- Chor-Verwaltung (Admin) -- */}
        {isAdmin && (
          <section>
            <h3 className="settings-heading">Chor-Verwaltung</h3>
            <div className="settings-nav-list">
              <button className="settings-nav-item" onClick={() => navigate('/settings/choir')}>
                <Building2 size={18} />
                <span>Chor-Einstellungen</span>
                <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
              </button>
              <button className="settings-nav-item" onClick={() => navigate('/settings/data')}>
                <Database size={18} />
                <span>Daten &amp; Sync</span>
                <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
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
              {isAdmin && (
                <button className="settings-nav-item" onClick={() => navigate('/admin/datacare')}>
                  <RefreshCw size={18} />
                  <span>Datenpflege</span>
                  <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
                </button>
              )}
              {isAdmin && (
                <button className="settings-nav-item" onClick={() => navigate('/admin/guest-links')}>
                  <Link size={18} />
                  <span>Gast-Zugaenge</span>
                  <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
                </button>
              )}
              {isDeveloper && (
                <button className="settings-nav-item" onClick={() => navigate('/admin/choirs')}>
                  <Music size={18} />
                  <span>Choere verwalten</span>
                  <ChevronRight size={16} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
                </button>
              )}
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

        {/* -- Rechtliches -- */}
        <section className="settings-legal">
          <a href="/impressum" target="_blank" rel="noopener noreferrer">Impressum</a>
          <span aria-hidden="true"> · </span>
          <a href="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</a>
        </section>
      </div>
    </div>
  )
}
