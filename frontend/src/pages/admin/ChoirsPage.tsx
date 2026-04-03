import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Copy, Check, Pencil, X, LogIn, Trash2 } from 'lucide-react'
import { api } from '@/api/client.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog.tsx'
import type { User } from '@/types/index.ts'

interface Choir {
  id: string
  name: string
  invite_code: string
  dropbox_root_folder: string | null
  created_at: string
}

export function ChoirsPage() {
  const user = useAuthStore((s) => s.user)
  const [choirs, setChoirs] = useState<Choir[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [rootFolder, setRootFolder] = useState('')
  const [adminUsername, setAdminUsername] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Choir | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editInviteCode, setEditInviteCode] = useState('')
  const [editRootFolder, setEditRootFolder] = useState('')
  const navigate = useNavigate()

  const loadChoirs = useCallback(async () => {
    try {
      const data = await api<Choir[]>('/admin/choirs')
      setChoirs(data)
    } catch {
      setMessage('Fehler beim Laden der Choere')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadChoirs()
  }, [loadChoirs])

  const createChoir = async () => {
    if (!name.trim() || !inviteCode.trim()) {
      setMessage('Name und Einladungscode sind erforderlich')
      return
    }
    if (!adminUsername.trim() || !adminPassword.trim()) {
      setMessage('Admin-Benutzername und -Passwort sind erforderlich')
      return
    }
    setSaving(true)
    try {
      await api('/admin/choirs', {
        method: 'POST',
        body: {
          name: name.trim(),
          invite_code: inviteCode.trim(),
          dropbox_root_folder: rootFolder.trim() || null,
          admin_username: adminUsername.trim(),
          admin_password: adminPassword.trim(),
        },
      })
      setName('')
      setInviteCode('')
      setRootFolder('')
      setAdminUsername('')
      setAdminPassword('')
      setShowForm(false)
      setMessage('Chor erstellt')
      loadChoirs()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (choir: Choir) => {
    setEditId(choir.id)
    setEditName(choir.name)
    setEditInviteCode(choir.invite_code)
    setEditRootFolder(choir.dropbox_root_folder || '')
  }

  const cancelEdit = () => setEditId(null)

  const saveEdit = async () => {
    if (!editId || !editName.trim() || !editInviteCode.trim()) {
      setMessage('Name und Einladungscode sind erforderlich')
      return
    }
    setSaving(true)
    try {
      await api(`/admin/choirs/${editId}`, {
        method: 'PUT',
        body: {
          name: editName.trim(),
          invite_code: editInviteCode.trim(),
          dropbox_root_folder: editRootFolder.trim() || null,
        },
      })
      setEditId(null)
      setMessage('Chor aktualisiert')
      loadChoirs()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  const switchChoir = async (choir: Choir) => {
    try {
      const updatedUser = await api<User>(`/admin/choirs/${choir.id}/switch`, { method: 'POST' })
      localStorage.setItem('choirbox_user', JSON.stringify(updatedUser))
      useAuthStore.setState({ user: updatedUser })
      setMessage(`Gewechselt zu: ${choir.name}`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Fehler beim Wechseln')
    }
  }

  const getLink = (choir: Choir) =>
    `${window.location.origin}${window.location.pathname}#/join/${encodeURIComponent(choir.invite_code)}`

  const copyLink = async (choir: Choir) => {
    const link = getLink(choir)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
      } else {
        const ta = document.createElement('textarea')
        ta.value = link
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopiedId(choir.id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      setMessage('Link konnte nicht kopiert werden')
    }
  }

  const deleteChoir = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api(`/admin/choirs/${deleteTarget.id}`, { method: 'DELETE' })
      setMessage(`"${deleteTarget.name}" geloescht`)
      setDeleteTarget(null)
      loadChoirs()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Fehler beim Loeschen')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate('/settings')}>
          <ChevronLeft size={22} />
        </button>
        <div className="topbar-title">Choere verwalten</div>
        <button className="player-header-btn" onClick={() => setShowForm(!showForm)}>
          <Plus size={20} />
        </button>
      </div>

      {message && (
        <div
          style={{ padding: '10px 16px', background: 'var(--bg-tertiary)', fontSize: 13 }}
          onClick={() => setMessage('')}
        >
          {message}
        </div>
      )}

      {showForm && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="auth-field">
            <label className="auth-label">Chor-Name</label>
            <input className="auth-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Singkreis Harmonie" />
          </div>
          <div className="auth-field">
            <label className="auth-label">Einladungscode</label>
            <input className="auth-input" type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="z.B. Harmonie2026" />
          </div>
          <div className="auth-field">
            <label className="auth-label">Chor-Ordner in der Dropbox</label>
            <input className="auth-input" type="text" value={rootFolder} onChange={(e) => setRootFolder(e.target.value)} placeholder="z.B. Singkreis Harmonie" />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 -4px' }}>Admin-Account fuer diesen Chor</div>
          <div className="auth-field">
            <label className="auth-label">Admin-Benutzername</label>
            <input className="auth-input" type="text" value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} placeholder="z.B. admin-harmonie" autoComplete="off" />
          </div>
          <div className="auth-field">
            <label className="auth-label">Admin-Passwort (wird nach Login geaendert)</label>
            <input className="auth-input" type="text" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="Initiales Passwort" autoComplete="off" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={createChoir} disabled={saving}>
              {saving ? 'Erstellen...' : 'Chor erstellen'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Abbrechen</button>
          </div>
        </div>
      )}

      {loading && <div className="empty-state">Laden...</div>}

      <ul className="file-list">
        {choirs.map((c) => (
          <li key={c.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            {editId === c.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="auth-field">
                  <label className="auth-label">Chor-Name</label>
                  <input className="auth-input" type="text" value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="auth-field">
                  <label className="auth-label">Einladungscode</label>
                  <input className="auth-input" type="text" value={editInviteCode} onChange={(e) => setEditInviteCode(e.target.value)} />
                </div>
                <div className="auth-field">
                  <label className="auth-label">Chor-Ordner in der Dropbox</label>
                  <input className="auth-input" type="text" value={editRootFolder} onChange={(e) => setEditRootFolder(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveEdit} disabled={saving}>
                    <Check size={16} style={{ marginRight: 4 }} /> Speichern
                  </button>
                  <button className="btn btn-secondary" onClick={cancelEdit}><X size={16} /></button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div className="user-avatar">{c.name.charAt(0).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div className="file-name">{c.name}</div>
                    <div className="file-meta">{c.dropbox_root_folder || 'Kein Chor-Ordner'}</div>
                  </div>
                  <button className="player-header-btn" title="Bearbeiten" onClick={() => startEdit(c)}>
                    <Pencil size={16} />
                  </button>
                  {user?.choir_id !== c.id && (
                    <button className="player-header-btn" title="Loeschen" onClick={() => setDeleteTarget(c)}>
                      <Trash2 size={16} style={{ color: 'var(--danger)' }} />
                    </button>
                  )}
                  {user?.choir_id === c.id ? (
                    <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, padding: '4px 8px' }}>Aktiv</span>
                  ) : (
                    <button className="player-header-btn" title="In diesen Chor wechseln" onClick={() => switchChoir(c)}>
                      <LogIn size={16} />
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <a href={getLink(c)} style={{ fontSize: 12, color: 'var(--accent)', wordBreak: 'break-all', flex: 1 }}>
                    {getLink(c)}
                  </a>
                  <button className="player-header-btn" title="Einladungslink kopieren" onClick={() => copyLink(c)} style={{ flexShrink: 0 }}>
                    {copiedId === c.id ? <Check size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {!loading && choirs.length === 0 && (
        <div className="empty-state">Keine Choere vorhanden</div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Chor loeschen"
          filename={deleteTarget.name}
          hint="Alle Nutzer, Labels und Daten dieses Chors werden unwiderruflich geloescht. Dropbox-Ordner muessen manuell entfernt werden."
          confirmLabel="Endgueltig loeschen"
          confirmLoadingLabel="Loeschen..."
          onConfirm={deleteChoir}
          onClose={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
    </div>
  )
}
