import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Copy, Check } from 'lucide-react'
import { api } from '@/api/client.ts'

interface Choir {
  id: string
  name: string
  invite_code: string
  dropbox_root_folder: string | null
  created_at: string
}

export function ChoirsPage() {
  const [choirs, setChoirs] = useState<Choir[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [rootFolder, setRootFolder] = useState('')
  const [saving, setSaving] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
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
    setSaving(true)
    try {
      await api('/admin/choirs', {
        method: 'POST',
        body: {
          name: name.trim(),
          invite_code: inviteCode.trim(),
          dropbox_root_folder: rootFolder.trim() || null,
        },
      })
      setName('')
      setInviteCode('')
      setRootFolder('')
      setShowForm(false)
      setMessage('Chor erstellt')
      loadChoirs()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    } finally {
      setSaving(false)
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
            <input
              className="auth-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Singkreis Harmonie"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label">Einladungscode</label>
            <input
              className="auth-input"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="z.B. Harmonie2026"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label">Dropbox-Stammordner</label>
            <input
              className="auth-input"
              type="text"
              value={rootFolder}
              onChange={(e) => setRootFolder(e.target.value)}
              placeholder="z.B. choirbox/Singkreis Harmonie"
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="auth-submit" style={{ flex: 1 }} onClick={createChoir} disabled={saving}>
              {saving ? 'Erstellen...' : 'Chor erstellen'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {loading && <div className="empty-state">Laden...</div>}

      <ul className="file-list">
        {choirs.map((c) => (
          <li key={c.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div className="user-avatar">
                {c.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div className="file-name">{c.name}</div>
                <div className="file-meta">
                  {c.dropbox_root_folder || 'Kein Stammordner'}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <a
                href={getLink(c)}
                style={{ fontSize: 12, color: 'var(--accent)', wordBreak: 'break-all', flex: 1 }}
              >
                {getLink(c)}
              </a>
              <button
                className="player-header-btn"
                title="Einladungslink kopieren"
                onClick={() => copyLink(c)}
                style={{ flexShrink: 0 }}
              >
                {copiedId === c.id ? <Check size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {!loading && choirs.length === 0 && (
        <div className="empty-state">Keine Choere vorhanden</div>
      )}
    </div>
  )
}
