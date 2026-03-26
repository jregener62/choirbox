import { useState, useEffect, useCallback } from 'react'
import { Folder, Music, ArrowUp, ChevronRight, Search } from 'lucide-react'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAppStore } from '@/stores/appStore.ts'
import type { BrowseResponse, DropboxEntry } from '@/types/index.ts'

export function BrowsePage() {
  const browsePath = useAppStore((s) => s.browsePath)
  const setBrowsePath = useAppStore((s) => s.setBrowsePath)
  const currentPath = usePlayerStore((s) => s.currentPath)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const [entries, setEntries] = useState<DropboxEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadFolder = useCallback(async (path: string) => {
    setLoading(true)
    setError('')
    try {
      const data = await api<BrowseResponse>(`/dropbox/browse?path=${encodeURIComponent(path)}`)
      setEntries(data.entries)
      setBrowsePath(data.path)
      if (data.error) setError(data.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }, [setBrowsePath])

  useEffect(() => {
    loadFolder(browsePath)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleEntryClick = (entry: DropboxEntry) => {
    if (entry.type === 'folder') {
      loadFolder(entry.path)
    } else {
      usePlayerStore.getState().setTrack(entry.path, entry.name)
      usePlayerStore.getState().setPlaying(true)
    }
  }

  const navigateUp = () => {
    const parts = browsePath.split('/').filter(Boolean)
    parts.pop()
    const parent = parts.length > 0 ? '/' + parts.join('/') : ''
    loadFolder(parent)
  }

  const pathParts = browsePath.split('/').filter(Boolean)

  return (
    <div>
      <div className="topbar">
        <div className="topbar-title">Dateien</div>
        <button className="btn-icon" style={{ color: 'var(--text-muted)' }}>
          <Search size={20} />
        </button>
      </div>

      {browsePath && (
        <div className="breadcrumb">
          <span className="breadcrumb-item" onClick={() => loadFolder('')}>
            Root
          </span>
          {pathParts.map((part, i) => {
            const path = '/' + pathParts.slice(0, i + 1).join('/')
            const isLast = i === pathParts.length - 1
            return (
              <span key={path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                {isLast ? (
                  <span className="breadcrumb-current">{part}</span>
                ) : (
                  <span className="breadcrumb-item" onClick={() => loadFolder(path)}>
                    {part}
                  </span>
                )}
              </span>
            )
          })}
        </div>
      )}

      {loading && (
        <div className="empty-state">Laden...</div>
      )}

      {error && (
        <div className="empty-state" style={{ color: 'var(--danger)' }}>{error}</div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="empty-state">
          <Folder size={48} strokeWidth={1} style={{ opacity: 0.3 }} />
          <div>Keine Dateien in diesem Ordner</div>
        </div>
      )}

      <ul className="file-list">
        {browsePath && (
          <li className="file-item" onClick={navigateUp}>
            <div className="file-icon-box file-icon-folder">
              <ArrowUp size={18} />
            </div>
            <div className="file-info">
              <div className="file-name" style={{ color: 'var(--text-muted)' }}>..</div>
            </div>
          </li>
        )}
        {entries.map((entry) => {
          const isActive = entry.type === 'file' && entry.path === currentPath
          return (
            <li
              key={entry.path}
              className={`file-item ${isActive ? 'file-item--active' : ''}`}
              onClick={() => handleEntryClick(entry)}
            >
              {entry.type === 'folder' ? (
                <div className="file-icon-box file-icon-folder">
                  <Folder size={18} />
                </div>
              ) : isActive && isPlaying ? (
                <div className="file-icon-box file-icon-playing">
                  <div className="playing-bars">
                    <span /><span /><span />
                  </div>
                </div>
              ) : (
                <div className="file-icon-box file-icon-audio">
                  <Music size={18} />
                </div>
              )}
              <div className="file-info">
                <div className={`file-name ${isActive ? 'file-name--active' : ''}`}>
                  {entry.name}
                </div>
                {entry.type === 'file' && entry.size && (
                  <div className="file-meta">
                    {(entry.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                )}
              </div>
              {entry.type === 'folder' && (
                <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
