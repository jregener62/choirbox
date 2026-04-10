import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Trash2, RefreshCw } from 'lucide-react'
import { api } from '@/api/client.ts'

interface OrphanSong {
  id: number
  folder_path: string
  name: string
  dropbox_file_id: string | null
  sections: number
  documents: number
  favorites: number
}

interface OrphanDocument {
  id: number
  folder_path: string
  original_name: string
  annotations: number
  chord_prefs: number
  selections: number
  hidden: number
}

interface OrphanFavorite {
  id: number
  user_id: string
  dropbox_path: string
  entry_type: string
}

interface OrphanNote {
  id: number
  user_id: string
  dropbox_path: string
}

interface OrphanUserLabel {
  id: number
  user_id: string
  dropbox_path: string
  label_id: number
}

interface OrphansResponse {
  songs: OrphanSong[]
  documents: OrphanDocument[]
  user_data: {
    favorites: OrphanFavorite[]
    notes: OrphanNote[]
    user_labels: OrphanUserLabel[]
  }
}

type Tab = 'songs' | 'documents' | 'user_data'

export function DataCarePage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('songs')
  const [data, setData] = useState<OrphansResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api<OrphansResponse>('/admin/datacare/orphans')
      setData(r)
    } catch {
      setMessage('Fehler beim Laden der Orphans')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const deleteSong = async (s: OrphanSong) => {
    const summary = `${s.sections} Sections, ${s.documents} Dokumente, ${s.favorites} Favoriten`
    if (!confirm(`"${s.name}" endgueltig loeschen?\n\nBetroffen: ${summary}`)) return
    try {
      await api(`/admin/datacare/song/${s.id}`, { method: 'DELETE' })
      setMessage(`"${s.name}" geloescht`)
      load()
    } catch {
      setMessage('Fehler beim Loeschen')
    }
  }

  const reactivateSong = async (s: OrphanSong) => {
    const newPath = prompt(
      `Neuen Dropbox-Ordner-Pfad fuer "${s.name}" eingeben:\n` +
      `(choir-relativ, z.B. Country Roads.song)`,
      s.folder_path,
    )
    if (!newPath) return
    try {
      await api(`/admin/datacare/song/${s.id}/reactivate`, {
        method: 'POST',
        body: { folder_path: newPath },
      })
      setMessage(`"${s.name}" wieder verbunden`)
      load()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Fehler beim Wiederverbinden')
    }
  }

  const deleteDocument = async (d: OrphanDocument) => {
    const summary = `${d.annotations} Annotationen, ${d.chord_prefs} Transponierungen, ${d.selections} Auswahlen`
    if (!confirm(`Dokument "${d.original_name}" endgueltig loeschen?\n\nBetroffen: ${summary}`)) return
    try {
      await api(`/admin/datacare/document/${d.id}`, { method: 'DELETE' })
      setMessage(`"${d.original_name}" geloescht`)
      load()
    } catch {
      setMessage('Fehler beim Loeschen')
    }
  }

  const deleteFav = async (f: OrphanFavorite) => {
    if (!confirm(`Favorit "${f.dropbox_path}" loeschen?`)) return
    await api(`/admin/datacare/user-data/favorite/${f.id}`, { method: 'DELETE' })
    load()
  }
  const deleteNote = async (n: OrphanNote) => {
    if (!confirm(`Notiz fuer "${n.dropbox_path}" loeschen?`)) return
    await api(`/admin/datacare/user-data/note/${n.id}`, { method: 'DELETE' })
    load()
  }
  const deleteLabel = async (u: OrphanUserLabel) => {
    if (!confirm(`Label-Zuweisung fuer "${u.dropbox_path}" loeschen?`)) return
    await api(`/admin/datacare/user-data/user-label/${u.id}`, { method: 'DELETE' })
    load()
  }

  const songCount = data?.songs.length ?? 0
  const docCount = data?.documents.length ?? 0
  const userDataCount = (data?.user_data.favorites.length ?? 0)
    + (data?.user_data.notes.length ?? 0)
    + (data?.user_data.user_labels.length ?? 0)

  return (
    <div className="page-container">
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate('/settings')}>
          <ChevronLeft size={22} />
        </button>
        <div className="topbar-title">Datenpflege</div>
        <button className="player-header-btn" onClick={load} title="Neu laden">
          <RefreshCw size={18} />
        </button>
      </div>

      {message && (
        <div style={{ padding: '10px 16px', background: 'var(--bg-tertiary)', fontSize: 13 }}
          onClick={() => setMessage('')}>{message}</div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-4)' }}>
        <button
          className={`btn ${tab === 'songs' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('songs')}
        >Songs ({songCount})</button>
        <button
          className={`btn ${tab === 'documents' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('documents')}
        >Dokumente ({docCount})</button>
        <button
          className={`btn ${tab === 'user_data' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('user_data')}
        >User-Daten ({userDataCount})</button>
      </div>

      {loading && <div className="empty-state">Laden...</div>}

      {!loading && tab === 'songs' && (
        <ul className="file-list">
          {data?.songs.length === 0 && <li className="empty-state">Keine orphan Songs</li>}
          {data?.songs.map((s) => (
            <li key={s.id} className="file-item" style={{ cursor: 'default' }}>
              <div className="file-info">
                <div className="file-name">{s.name}</div>
                <div className="file-meta">
                  {s.folder_path} · {s.sections} Sec · {s.documents} Docs · {s.favorites} Favs
                </div>
              </div>
              <button className="player-header-btn" title="Wiederfinden" onClick={() => reactivateSong(s)}>
                <RefreshCw size={16} />
              </button>
              <button className="player-header-btn" title="Endgueltig loeschen"
                onClick={() => deleteSong(s)} style={{ color: 'var(--danger)' }}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && tab === 'documents' && (
        <ul className="file-list">
          {data?.documents.length === 0 && <li className="empty-state">Keine orphan Dokumente</li>}
          {data?.documents.map((d) => (
            <li key={d.id} className="file-item" style={{ cursor: 'default' }}>
              <div className="file-info">
                <div className="file-name">{d.original_name}</div>
                <div className="file-meta">
                  {d.folder_path} · {d.annotations} Ann · {d.chord_prefs} Transp · {d.selections} Sel
                </div>
              </div>
              <button className="player-header-btn" title="Endgueltig loeschen"
                onClick={() => deleteDocument(d)} style={{ color: 'var(--danger)' }}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && tab === 'user_data' && (
        <ul className="file-list">
          {userDataCount === 0 && <li className="empty-state">Keine Legacy-User-Daten</li>}
          {data?.user_data.favorites.map((f) => (
            <li key={`f-${f.id}`} className="file-item" style={{ cursor: 'default' }}>
              <div className="file-info">
                <div className="file-name">[Favorit] {f.dropbox_path}</div>
                <div className="file-meta">User: {f.user_id} · {f.entry_type}</div>
              </div>
              <button className="player-header-btn" title="Loeschen"
                onClick={() => deleteFav(f)} style={{ color: 'var(--danger)' }}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
          {data?.user_data.notes.map((n) => (
            <li key={`n-${n.id}`} className="file-item" style={{ cursor: 'default' }}>
              <div className="file-info">
                <div className="file-name">[Notiz] {n.dropbox_path}</div>
                <div className="file-meta">User: {n.user_id}</div>
              </div>
              <button className="player-header-btn" title="Loeschen"
                onClick={() => deleteNote(n)} style={{ color: 'var(--danger)' }}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
          {data?.user_data.user_labels.map((u) => (
            <li key={`u-${u.id}`} className="file-item" style={{ cursor: 'default' }}>
              <div className="file-info">
                <div className="file-name">[Label] {u.dropbox_path}</div>
                <div className="file-meta">User: {u.user_id} · Label: {u.label_id}</div>
              </div>
              <button className="player-header-btn" title="Loeschen"
                onClick={() => deleteLabel(u)} style={{ color: 'var(--danger)' }}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
