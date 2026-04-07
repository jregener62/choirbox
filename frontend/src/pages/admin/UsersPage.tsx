import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Trash2, Bug } from 'lucide-react'
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
}

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

      {loading && <div className="empty-state">Laden...</div>}

      <ul className="file-list">
        {users.map((u) => (
          <li key={u.id} className="file-item" style={{ cursor: 'default' }}>
            <div className="user-avatar">
              {u.display_name.charAt(0).toUpperCase()}
            </div>
            <div className="file-info">
              <div className="file-name">{u.display_name}</div>
              <div className="file-meta">
                {u.voice_part} · Login: {formatDate(u.last_login_at)}
              </div>
            </div>
            <select
              value={u.role}
              onChange={(e) => changeRole(u, e.target.value)}
              style={{
                padding: '4px 6px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: 12,
                minWidth: 0,
              }}
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            {isDeveloper && (
              <button
                className="player-header-btn"
                title={u.can_report_bugs ? 'Bug-Reporting deaktivieren' : 'Bug-Reporting aktivieren'}
                onClick={() => toggleBugReporting(u)}
                style={{ color: u.can_report_bugs ? '#f59e0b' : 'var(--text-muted)' }}
              >
                <Bug size={16} />
              </button>
            )}
            <button className="player-header-btn" title="Loeschen" onClick={() => deleteUser(u)}
              style={{ color: 'var(--danger)' }}>
              <Trash2 size={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
