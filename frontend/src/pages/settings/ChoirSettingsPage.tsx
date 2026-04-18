import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Link, Copy, Folder, Eye, Music, FileText, Mic, Guitar, Shuffle } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import { api } from '@/api/client.ts'
import { hasMinRole } from '@/utils/roles.ts'

interface AdminSettings {
  invite_code: string | null
  dropbox_root_folder: string | null
  default_view_mode: 'songs' | 'texts'
  display_mode: 'vocal' | 'instrumental' | 'gemischt'
}

export function ChoirSettingsPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const isAdmin = hasMinRole(user?.role ?? 'guest', 'admin')

  const [inviteCode, setInviteCode] = useState('')
  const [inviteCodeSaving, setInviteCodeSaving] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [rootFolder, setRootFolder] = useState('')
  const [rootFolderSaving, setRootFolderSaving] = useState(false)
  const [defaultViewMode, setDefaultViewMode] = useState<'songs' | 'texts'>('songs')
  const [defaultViewModeSaving, setDefaultViewModeSaving] = useState(false)
  const [displayMode, setDisplayMode] = useState<'vocal' | 'instrumental' | 'gemischt'>('instrumental')
  const [displayModeSaving, setDisplayModeSaving] = useState(false)
  const [message, setMessage] = useState('')

  const loadAdminSettings = useCallback(async () => {
    if (!isAdmin) return
    try {
      const settings = await api<AdminSettings>('/admin/settings')
      setInviteCode(settings.invite_code || '')
      setRootFolder(settings.dropbox_root_folder || '')
      setDefaultViewMode(settings.default_view_mode === 'texts' ? 'texts' : 'songs')
      const dm = settings.display_mode
      setDisplayMode(dm === 'vocal' || dm === 'gemischt' ? dm : 'instrumental')
    } catch {
      // ignore
    }
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) {
      navigate('/settings', { replace: true })
      return
    }
    loadAdminSettings()
  }, [isAdmin, loadAdminSettings, navigate])

  const saveInviteCode = async () => {
    setInviteCodeSaving(true)
    try {
      await api('/admin/settings', { method: 'PUT', body: { invite_code: inviteCode } })
      setMessage('Einladungscode gespeichert')
    } catch {
      setMessage('Fehler beim Speichern')
    } finally {
      setInviteCodeSaving(false)
    }
  }

  const getInviteLink = () =>
    `${window.location.origin}${window.location.pathname}#/join/${encodeURIComponent(inviteCode)}`

  const copyInviteLink = async () => {
    if (!inviteCode) return
    const link = getInviteLink()
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
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      setMessage('Link konnte nicht kopiert werden')
    }
  }

  const saveRootFolder = async () => {
    setRootFolderSaving(true)
    try {
      await api('/admin/settings', { method: 'PUT', body: { dropbox_root_folder: rootFolder.trim() || null } })
      setMessage('Chor-Ordner gespeichert')
    } catch {
      setMessage('Fehler beim Speichern')
    } finally {
      setRootFolderSaving(false)
    }
  }

  const saveDefaultViewMode = async (mode: 'songs' | 'texts') => {
    if (mode === defaultViewMode) return
    setDefaultViewModeSaving(true)
    try {
      await api('/admin/settings', { method: 'PUT', body: { default_view_mode: mode } })
      setDefaultViewMode(mode)
      setMessage(`Default-Ansicht fuer neue Mitglieder: ${mode === 'texts' ? 'Nur Texte' : 'Alles'}`)
    } catch {
      setMessage('Fehler beim Speichern')
    } finally {
      setDefaultViewModeSaving(false)
    }
  }

  const saveDisplayMode = async (mode: 'vocal' | 'instrumental' | 'gemischt') => {
    if (mode === displayMode) return
    setDisplayModeSaving(true)
    try {
      await api('/admin/settings', { method: 'PUT', body: { display_mode: mode } })
      setDisplayMode(mode)
      const labels: Record<typeof mode, string> = {
        vocal: 'Gesang (ohne Akkorde)',
        instrumental: 'Instrumental (mit Akkorden)',
        gemischt: 'Gemischt (User entscheidet)',
      }
      setMessage(`Anzeige-Modus: ${labels[mode]}. Wirkt nach dem naechsten Login.`)
    } catch {
      setMessage('Fehler beim Speichern')
    } finally {
      setDisplayModeSaving(false)
    }
  }

  if (!isAdmin) return null

  return (
    <div>
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate('/settings')}>
          <ChevronLeft size={22} />
        </button>
        <div className="topbar-title">Chor-Einstellungen</div>
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

        {/* -- Einladungslink -- */}
        <section>
          <h3 className="settings-heading"><Link size={14} /> Einladungslink</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Diesen Link an neue Chormitglieder weitergeben.
          </div>
          {inviteCode && (
            <>
              <a
                href={getInviteLink()}
                style={{ fontSize: 12, color: 'var(--accent)', wordBreak: 'break-all', display: 'block', marginBottom: 8 }}
              >
                {getInviteLink()}
              </a>
              <button
                className="btn btn-secondary"
                style={{ width: '100%', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                onClick={copyInviteLink}
              >
                <Copy size={16} />
                {linkCopied ? 'Link kopiert!' : 'Einladungslink kopieren'}
              </button>
            </>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="auth-input"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="z.B. MeinChor2026"
            />
            <button
              className="btn btn-primary"
              onClick={saveInviteCode}
              disabled={inviteCodeSaving}
              style={{ width: 'auto', padding: '10px 20px' }}
            >
              {inviteCodeSaving ? '...' : 'OK'}
            </button>
          </div>
        </section>

        {/* -- Chor-Ordner -- */}
        <section>
          <h3 className="settings-heading"><Folder size={14} /> Chor-Ordner</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            Dropbox-Unterordner dieses Chors (z.B. "Mein Chor").
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="auth-input"
              type="text"
              value={rootFolder}
              onChange={(e) => setRootFolder(e.target.value)}
              placeholder="z.B. Mein Chor"
            />
            <button
              className="btn btn-primary"
              onClick={saveRootFolder}
              disabled={rootFolderSaving}
              style={{ width: 'auto', padding: '10px 20px' }}
            >
              {rootFolderSaving ? '...' : 'OK'}
            </button>
          </div>
        </section>

        {/* -- Default-Ansicht fuer neue Mitglieder -- */}
        <section>
          <h3 className="settings-heading"><Eye size={14} /> Default-Ansicht fuer neue Mitglieder</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Gilt fuer Mitglieder, die sich ueber den Einladungslink registrieren oder vom Admin angelegt werden.
            Bestehende Mitglieder sind nicht betroffen — diese werden per Einzel-Toggle oder Bulk-Umschaltung in der Nutzerverwaltung umgestellt.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => saveDefaultViewMode('songs')}
              disabled={defaultViewModeSaving}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 12px', borderRadius: 8,
                border: `2px solid ${defaultViewMode === 'songs' ? 'var(--accent)' : 'var(--border)'}`,
                background: defaultViewMode === 'songs' ? 'rgba(129,140,248,0.10)' : 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
                cursor: defaultViewModeSaving ? 'wait' : 'pointer',
              }}
            >
              <Music size={16} /> Alles
            </button>
            <button
              onClick={() => saveDefaultViewMode('texts')}
              disabled={defaultViewModeSaving}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 12px', borderRadius: 8,
                border: `2px solid ${defaultViewMode === 'texts' ? 'var(--accent)' : 'var(--border)'}`,
                background: defaultViewMode === 'texts' ? 'rgba(129,140,248,0.10)' : 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
                cursor: defaultViewModeSaving ? 'wait' : 'pointer',
              }}
            >
              <FileText size={16} /> Nur Texte
            </button>
          </div>
        </section>

        {/* -- Anzeige-Modus fuer .cho-Dateien -- */}
        <section>
          <h3 className="settings-heading"><Music size={14} /> Anzeige-Modus fuer Texte/Noten</h3>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
            Bestimmt, ob Akkorde angezeigt und editiert werden koennen. Wirkt fuer alle Mitglieder nach dem naechsten Login.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => saveDisplayMode('vocal')}
              disabled={displayModeSaving}
              title="Nur Gesangstexte und Anweisungen, keine Akkorde"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 12px', borderRadius: 8,
                border: `2px solid ${displayMode === 'vocal' ? 'var(--accent)' : 'var(--border)'}`,
                background: displayMode === 'vocal' ? 'rgba(129,140,248,0.10)' : 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
                cursor: displayModeSaving ? 'wait' : 'pointer',
              }}
            >
              <Mic size={16} /> Gesang
            </button>
            <button
              onClick={() => saveDisplayMode('instrumental')}
              disabled={displayModeSaving}
              title="Texte mit Akkorden — volle Anzeige (Standard)"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 12px', borderRadius: 8,
                border: `2px solid ${displayMode === 'instrumental' ? 'var(--accent)' : 'var(--border)'}`,
                background: displayMode === 'instrumental' ? 'rgba(129,140,248,0.10)' : 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
                cursor: displayModeSaving ? 'wait' : 'pointer',
              }}
            >
              <Guitar size={16} /> Instrumental
            </button>
            <button
              onClick={() => saveDisplayMode('gemischt')}
              disabled={displayModeSaving}
              title="User entscheidet pro Song, ob Akkorde gezeigt werden"
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 12px', borderRadius: 8,
                border: `2px solid ${displayMode === 'gemischt' ? 'var(--accent)' : 'var(--border)'}`,
                background: displayMode === 'gemischt' ? 'rgba(129,140,248,0.10)' : 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
                cursor: displayModeSaving ? 'wait' : 'pointer',
              }}
            >
              <Shuffle size={16} /> Gemischt
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
