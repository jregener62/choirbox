import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Trash2, Bug, Music, FileText } from 'lucide-react'
import { api } from '@/api/client.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { ALL_ROLES, ROLE_LABELS, hasMinRole, type Role } from '@/utils/roles.ts'

interface AdminUser {
  id: string
  username: string
  display_name: string
  role: string
  voice_part: string
  created_at: string
  last_login_at: string | null
  can_report_bugs: boolean
  view_mode: 'songs' | 'texts'
}

// Rollen, fuer die view_mode wirksam ist (Chorleiter/Admin/Developer bekommen immer vollen Zugriff).
const VIEW_MODE_APPLICABLE_ROLES = new Set(['member', 'pro-member'])

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)
  const isDeveloper = currentUser ? hasMinRole(currentUser.role, 'developer') : false

  const loadUsers = useCallback(async () => {
    try {
      const data = await api<AdminUser[]>('/admin/users')
      setUsers(data)
    } catch {
      setMessage('Fehler beim Laden der Nutzer')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const changeRole = async (user: AdminUser, newRole: string) => {
    if (newRole === user.role) return
    const label = ROLE_LABELS[newRole as Role] ?? newRole
    if (!confirm(`${user.display_name} zu "${label}" aendern?`)) return
    try {
      await api(`/admin/users/${user.id}`, { method: 'PUT', body: { role: newRole } })
      setMessage(`${user.display_name} ist jetzt ${label}`)
      loadUsers()
    } catch {
      setMessage('Fehler beim Aendern der Rolle')
    }
  }

  const toggleBugReporting = async (user: AdminUser) => {
    try {
      await api(`/admin/users/${user.id}`, { method: 'PUT', body: { can_report_bugs: !user.can_report_bugs } })
      setMessage(`Bug-Reporting fuer ${user.display_name} ${user.can_report_bugs ? 'deaktiviert' : 'aktiviert'}`)
      loadUsers()
    } catch {
      setMessage('Fehler beim Aendern der Bug-Reporting-Berechtigung')
    }
  }

  const toggleViewMode = async (user: AdminUser) => {
    const next = user.view_mode === 'texts' ? 'songs' : 'texts'
    try {
      await api(`/admin/users/${user.id}`, { method: 'PUT', body: { view_mode: next } })
      setMessage(
        `${user.display_name}: ${next === 'texts' ? 'Nur Texte' : 'Voller Zugriff'}`,
      )
      loadUsers()
    } catch {
      setMessage('Fehler beim Aendern der Ansicht')
    }
  }

  const bulkSetViewMode = async (mode: 'songs' | 'texts') => {
    const memberCount = users.filter((u) => VIEW_MODE_APPLICABLE_ROLES.has(u.role)).length
    if (memberCount === 0) {
      setMessage('Keine Member im Chor')
      return
    }
    const label = mode === 'texts' ? '"Nur Texte"' : '"Voller Zugriff"'
    if (!confirm(`${memberCount} Member auf ${label} umschalten?\nChorleiter und Admins bleiben unveraendert.`)) return
    try {
      const res = await api<{ outcome: string; data: { updated: number; skipped: number } }>(
        '/admin/users/bulk-view-mode',
        { method: 'POST', body: { view_mode: mode, user_ids: 'all-members' } },
      )
      setMessage(`Umgeschaltet: ${res.data.updated} Nutzer`)
      loadUsers()
    } catch {
      setMessage('Fehler beim Umschalten')
    }
  }

  const deleteUser = async (user: AdminUser) => {
    if (!confirm(`${user.display_name} wirklich loeschen?`)) return
    try {
      await api(`/admin/users/${user.id}`, { method: 'DELETE' })
      setMessage(`${user.display_name} geloescht`)
      loadUsers()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Fehler beim Loeschen')
    }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return 'Nie'
    const d = new Date(iso)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  return (
    <div>
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate('/settings')}>
          <ChevronLeft size={22} />
        </button>
        <div className="topbar-title">Nutzer verwalten</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '0 8px' }}>{users.length}</div>
      </div>

      {message && (
        <div style={{ padding: '10px 16px', background: 'var(--bg-tertiary)', fontSize: 13 }}
          onClick={() => setMessage('')}>{message}</div>
      )}

      {/* Bulk-Toolbar: schnelle Umschaltung aller Member auf einen Modus. */}
      <div style={{
        display: 'flex', gap: 8, padding: '8px 14px',
        background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)',
        fontSize: 12,
      }}>
        <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>Alle Member:</span>
        <button
          onClick={() => bulkSetViewMode('texts')}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
            border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
          }}
          title="Alle Member auf Nur Texte setzen"
        >
          <FileText size={14} /> Nur Texte
        </button>
        <button
          onClick={() => bulkSetViewMode('songs')}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
            border: '1px solid var(--border)', borderRadius: 6,
            background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
            fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
          }}
          title="Alle Member auf vollen Zugriff setzen"
        >
          <Music size={14} /> Alles
        </button>
      </div>

      {loading && <div className="empty-state">Laden...</div>}

      <ul className="file-list">
        {users.map((u) => {
          const vmApplicable = VIEW_MODE_APPLICABLE_ROLES.has(u.role)
          const isTexts = u.view_mode === 'texts'
          return (
            <li
              key={u.id}
              className="file-item"
              style={{
                cursor: 'default',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 8,
                padding: '10px 14px',
              }}
            >
              {/* Zeile 1: Avatar + Name/Meta + Loeschen-Button (destruktiv → oben rechts getrennt). */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="user-avatar">
                  {u.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="file-info" style={{ flex: 1, minWidth: 0 }}>
                  <div className="file-name">{u.display_name}</div>
                  <div className="file-meta">
                    {u.voice_part ? `${u.voice_part} · ` : ''}Login: {formatDate(u.last_login_at)}
                  </div>
                </div>
                <button
                  className="player-header-btn"
                  title="Loeschen"
                  onClick={() => deleteUser(u)}
                  style={{ color: 'var(--danger)' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {/* Zeile 2: Rolle + Ansicht + Bug (fuer Developer). Labels inline, keine Spaltenkopf noetig. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 46 }}>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: 'var(--text-muted)',
                }}>
                  <span>Rolle:</span>
                  <select
                    value={u.role}
                    onChange={(e) => changeRole(u, e.target.value)}
                    style={{
                      padding: '4px 6px', borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                    }}
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => vmApplicable && toggleViewMode(u)}
                  disabled={!vmApplicable}
                  title={
                    !vmApplicable
                      ? 'Chorleiter/Admin haben immer vollen Zugriff'
                      : isTexts ? 'Nur Texte (klicken fuer vollen Zugriff)' : 'Voller Zugriff (klicken fuer Nur Texte)'
                  }
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 8px', borderRadius: 6,
                    border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    color: !vmApplicable
                      ? 'var(--text-muted)'
                      : isTexts ? 'var(--accent)' : 'var(--text-primary)',
                    opacity: vmApplicable ? 1 : 0.5,
                    fontSize: 12, fontFamily: 'inherit',
                    cursor: vmApplicable ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isTexts ? <FileText size={14} /> : <Music size={14} />}
                  <span>Ansicht: {isTexts ? 'Nur Texte' : 'Alles'}</span>
                </button>
                {isDeveloper && (
                  <button
                    onClick={() => toggleBugReporting(u)}
                    title={u.can_report_bugs ? 'Bug-Reporting deaktivieren' : 'Bug-Reporting aktivieren'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '4px 8px', borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--bg-secondary)',
                      color: u.can_report_bugs ? '#f59e0b' : 'var(--text-muted)',
                      fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                    }}
                  >
                    <Bug size={14} />
                    <span>Bug-Report: {u.can_report_bugs ? 'An' : 'Aus'}</span>
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
