import { useState, useEffect, useCallback } from 'react'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import type { BrowseResponse, DropboxEntry } from '@/types/index.ts'

export function BrowsePage() {
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<DropboxEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadFolder = useCallback(async (path: string) => {
    setLoading(true)
    setError('')
    try {
      const data = await api<BrowseResponse>(`/dropbox/browse?path=${encodeURIComponent(path)}`)
      setEntries(data.entries)
      setCurrentPath(data.path)
      if (data.error) setError(data.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadFolder('')
  }, [loadFolder])

  const handleEntryClick = (entry: DropboxEntry) => {
    if (entry.type === 'folder') {
      loadFolder(entry.path)
    } else {
      usePlayerStore.getState().setTrack(entry.path, entry.name)
      usePlayerStore.getState().setPlaying(true)
    }
  }

  const navigateUp = () => {
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    const parent = parts.length > 0 ? '/' + parts.join('/') : ''
    loadFolder(parent)
  }

  // Build breadcrumb parts
  const pathParts = currentPath.split('/').filter(Boolean)

  return (
    <div>
      <div className="topbar">
        <div className="topbar-title">Dateien</div>
      </div>

      {currentPath && (
        <div className="breadcrumb">
          <span className="breadcrumb-item" onClick={() => loadFolder('')}>
            Root
          </span>
          {pathParts.map((part, i) => {
            const path = '/' + pathParts.slice(0, i + 1).join('/')
            const isLast = i === pathParts.length - 1
            return (
              <span key={path}>
                <span className="breadcrumb-separator"> / </span>
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
          <div className="empty-state-icon">{'\uD83D\uDCC2'}</div>
          <div>Keine Dateien in diesem Ordner</div>
        </div>
      )}

      <ul className="file-list">
        {currentPath && (
          <li className="file-item" onClick={navigateUp}>
            <div className="file-icon">{'\u2B06\uFE0F'}</div>
            <div className="file-info">
              <div className="file-name">..</div>
            </div>
          </li>
        )}
        {entries.map((entry) => (
          <li key={entry.path} className="file-item" onClick={() => handleEntryClick(entry)}>
            <div className="file-icon">
              {entry.type === 'folder' ? '\uD83D\uDCC1' : '\uD83C\uDFB5'}
            </div>
            <div className="file-info">
              <div className="file-name">{entry.name}</div>
              {entry.type === 'file' && entry.size && (
                <div className="file-meta">
                  {(entry.size / 1024 / 1024).toFixed(1)} MB
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
