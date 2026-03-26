import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client.ts'

interface AdminUser {
  id: string
  username: string
  display_name: string
  role: string
  voice_part: string
  created_at: string
  last_login_at: string | null
}

export function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

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

  const toggleRole = async (user: AdminUser) => {
    const newRole = user.role === 'admin' ? 'guest' : 'admin'
    const label = newRole === 'admin' ? 'Admin' : 'Mitglied'
    if (!confirm(`${user.display_name} zu ${label} machen?`)) return
    try {
      await api(`/admin/users/${user.id}`, { method: 'PUT', body: { role: newRole } })
      setMessage(`${user.display_name} ist jetzt ${label}`)
      loadUsers()
    } catch {
      setMessage('Fehler beim Aendern der Rolle')
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
        <button className="btn-icon" onClick={() => navigate('/settings')}>{'\u2190'}</button>
        <div className="topbar-title">Nutzer verwalten</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{users.length}</div>
      </div>

      {message && (
        <div
          style={{ padding: '10px 16px', background: 'var(--bg-tertiary)', fontSize: 14 }}
          onClick={() => setMessage('')}
        >
          {message}
        </div>
      )}

      {loading && <div className="empty-state">Laden...</div>}

      {!loading && users.length === 0 && (
        <div className="empty-state">Keine Nutzer vorhanden</div>
      )}

      <ul className="file-list">
        {users.map((u) => (
          <li key={u.id} className="user-item">
            <div className="user-avatar">
              {u.display_name.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <div className="user-name">{u.display_name}</div>
              <div className="user-meta">
                <span>{u.role === 'admin' ? 'Admin' : 'Mitglied'}</span>
                <span>{u.voice_part}</span>
                <span>Login: {formatDate(u.last_login_at)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className="btn-icon"
                title="Rolle aendern"
                onClick={() => toggleRole(u)}
                style={{ fontSize: 16 }}
              >
                {u.role === 'admin' ? '\uD83D\uDC51' : '\uD83D\uDC64'}
              </button>
              <button
                className="btn-icon"
                title="Loeschen"
                onClick={() => deleteUser(u)}
                style={{ fontSize: 16, color: 'var(--danger)' }}
              >
                {'\uD83D\uDDD1'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
