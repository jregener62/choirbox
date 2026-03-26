import { useState, useEffect, useCallback, useRef } from 'react'
import { Folder, Music, ArrowUp, ChevronRight, Search, X, Heart } from 'lucide-react'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAppStore } from '@/stores/appStore.ts'
import { useFavoritesStore } from '@/hooks/useFavorites.ts'
import { useLabelsStore } from '@/hooks/useLabels.ts'
import type { BrowseResponse, DropboxEntry } from '@/types/index.ts'

interface SearchResponse {
  query: string
  entries: DropboxEntry[]
}

export function BrowsePage() {
  const browsePath = useAppStore((s) => s.browsePath)
  const setBrowsePath = useAppStore((s) => s.setBrowsePath)
  const currentPath = usePlayerStore((s) => s.currentPath)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const { loaded: favsLoaded, load: loadFavs, isFavorite, toggle: toggleFav } = useFavoritesStore()
  const { loaded: labelsLoaded, load: loadLabels, getLabelsForPath } = useLabelsStore()
  const [entries, setEntries] = useState<DropboxEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<DropboxEntry[]>([])
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

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
    if (!favsLoaded) loadFavs()
    if (!labelsLoaded) loadLabels()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await api<SearchResponse>(`/dropbox/search?q=${encodeURIComponent(searchQuery)}`)
        setSearchResults(data.entries)
      } catch {
        setSearchResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(debounceRef.current)
  }, [searchQuery])

  const openSearch = () => {
    setSearchOpen(true)
    setTimeout(() => searchRef.current?.focus(), 100)
  }

  const closeSearch = () => {
    setSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])
  }

  const handleEntryClick = (entry: DropboxEntry) => {
    if (entry.type === 'folder') {
      closeSearch()
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

  // Which entries to show
  const isSearching = searchOpen && searchQuery.length >= 2
  const displayEntries = isSearching ? searchResults : entries

  return (
    <div>
      {/* Topbar: normal or search mode */}
      {searchOpen ? (
        <div className="topbar">
          <div className="search-bar">
            <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              ref={searchRef}
              className="search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Dateien suchen..."
              autoFocus
            />
            <button className="player-header-btn" onClick={closeSearch}>
              <X size={18} />
            </button>
          </div>
        </div>
      ) : (
        <div className="topbar">
          <div className="topbar-title">Dateien</div>
          <button className="player-header-btn" onClick={openSearch}>
            <Search size={20} />
          </button>
        </div>
      )}

      {/* Breadcrumb (hidden during search) */}
      {!isSearching && browsePath && (
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

      {/* Loading */}
      {(loading || searching) && (
        <div className="empty-state">Laden...</div>
      )}

      {/* Error */}
      {error && !isSearching && (
        <div className="empty-state" style={{ color: 'var(--danger)' }}>{error}</div>
      )}

      {/* Empty states */}
      {!loading && !searching && !error && displayEntries.length === 0 && (
        <div className="empty-state">
          {isSearching ? (
            <>
              <Search size={48} strokeWidth={1} style={{ opacity: 0.3 }} />
              <div>{searchQuery.length < 2 ? 'Mindestens 2 Zeichen eingeben' : 'Keine Ergebnisse'}</div>
            </>
          ) : (
            <>
              <Folder size={48} strokeWidth={1} style={{ opacity: 0.3 }} />
              <div>Keine Dateien in diesem Ordner</div>
            </>
          )}
        </div>
      )}

      {/* File list */}
      <ul className="file-list">
        {!isSearching && browsePath && (
          <li className="file-item" onClick={navigateUp}>
            <div className="file-icon-box file-icon-folder">
              <ArrowUp size={18} />
            </div>
            <div className="file-info">
              <div className="file-name" style={{ color: 'var(--text-muted)' }}>..</div>
            </div>
          </li>
        )}
        {displayEntries.map((entry) => {
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
                {isSearching && (
                  <div className="file-meta">{entry.path}</div>
                )}
                {!isSearching && entry.type === 'file' && entry.size && (
                  <div className="file-meta">
                    {(entry.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                )}
                {entry.type === 'file' && (() => {
                  const trackLabels = getLabelsForPath(entry.path)
                  return trackLabels.length > 0 ? (
                    <div className="file-labels">
                      {trackLabels.map((l) => (
                        <span key={l.id} className="label-chip-sm" style={{ background: l.color + '25', color: l.color }}>
                          {l.name}
                        </span>
                      ))}
                    </div>
                  ) : null
                })()}
              </div>
              {entry.type === 'folder' ? (
                <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              ) : (
                <button
                  className="fav-toggle"
                  onClick={(e) => { e.stopPropagation(); toggleFav(entry.path) }}
                >
                  <Heart
                    size={16}
                    fill={isFavorite(entry.path) ? '#f87171' : 'none'}
                    color={isFavorite(entry.path) ? '#f87171' : 'var(--text-muted)'}
                  />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
