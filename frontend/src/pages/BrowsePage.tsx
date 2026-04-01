import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Folder, ArrowLeft, ChevronRight, Search, X, Heart, Mic, Upload, Trash2, SlidersHorizontal, Settings, Tag, EllipsisVertical, Info } from 'lucide-react'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAppStore } from '@/stores/appStore.ts'
import { useFavoritesStore } from '@/hooks/useFavorites.ts'
import { useLabelsStore } from '@/hooks/useLabels.ts'
import { RecordingModal } from '@/components/ui/RecordingModal'
import { TrackBadges } from '@/components/ui/TrackBadges'
import { VoiceIcon } from '@/components/ui/VoiceIcon'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { platform } from '@/utils/platform'
import { formatDisplayName } from '@/utils/formatters.ts'
import type { BrowseResponse, DropboxEntry } from '@/types/index.ts'

interface SearchResponse {
  query: string
  entries: DropboxEntry[]
}

export function BrowsePage() {
  const navigate = useNavigate()
  const browsePath = useAppStore((s) => s.browsePath)
  const setBrowsePath = useAppStore((s) => s.setBrowsePath)
  const currentPath = usePlayerStore((s) => s.currentPath)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const { loaded: favsLoaded, load: loadFavs, isFavorite, toggle: toggleFav } = useFavoritesStore()
  const { labels, loaded: labelsLoaded, load: loadLabels, getLabelsForPath, isAssigned, toggleLabel, assignments } = useLabelsStore()
  const user = useAuthStore((s) => s.user)
  const canDelete = !!user && ['chorleiter', 'admin'].includes(user.role)
  const isProMember = hasMinRole(user?.role ?? 'guest', 'pro-member')
  const [entries, setEntries] = useState<DropboxEntry[]>([])
  const [rootName, setRootName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recordingOpen, setRecordingOpen] = useState(false)
  const [importedFile, setImportedFile] = useState<File | undefined>(undefined)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Swipe-to-delete state
  const [revealedPath, setRevealedPath] = useState<string | null>(null)
  const [swipeLabelPath, setSwipeLabelPath] = useState<string | null>(null)
  const [confirmEntry, setConfirmEntry] = useState<DropboxEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const didSwipeRef = useRef(false)

  // Filter state
  const [activeFilters, setActiveFilters] = useState<number[]>([])
  const [filterOpen, setFilterOpen] = useState(false)

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<DropboxEntry[]>([])
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const loadFolder = useCallback(async (path: string) => {
    setRevealedPath(null)
    setLoading(true)
    setError('')
    try {
      const data = await api<BrowseResponse>(`/dropbox/browse?path=${encodeURIComponent(path)}`)
      setEntries(data.entries)
      setBrowsePath(data.path)
      if (data.root_name !== undefined) setRootName(data.root_name)
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

  // Swipe-to-delete handlers
  const handleSwipeStart = (e: React.TouchEvent) => {
    swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    didSwipeRef.current = false
  }

  const handleSwipeEnd = (path: string, e: React.TouchEvent) => {
    const start = swipeStartRef.current
    swipeStartRef.current = null
    if (!start) return
    const dx = start.x - e.changedTouches[0].clientX
    const dy = Math.abs(start.y - e.changedTouches[0].clientY)
    if (dy > 30) return
    if (dx > 50) {
      didSwipeRef.current = true
      setRevealedPath(path)
    } else if (dx < -30) {
      didSwipeRef.current = true
      setRevealedPath(null)
    }
  }

  const handleDelete = async () => {
    if (!confirmEntry || deleting) return
    setDeleting(true)
    try {
      await api(`/dropbox/file?path=${encodeURIComponent(confirmEntry.path)}`, { method: 'DELETE' })
      if (confirmEntry.path === currentPath) {
        usePlayerStore.setState({ currentPath: null, currentName: null, isPlaying: false })
      }
      setConfirmEntry(null)
      setRevealedPath(null)
      await loadFolder(browsePath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Löschen')
      setConfirmEntry(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleEntryClick = (entry: DropboxEntry) => {
    if (didSwipeRef.current) { didSwipeRef.current = false; return }
    if (revealedPath) { setRevealedPath(null); return }
    if (entry.type === 'folder') {
      closeSearch()
      useAppStore.getState().setBrowseReturnTo(null)
      loadFolder(entry.path)
    } else {
      if (entry.path !== currentPath) {
        usePlayerStore.getState().setTrack(entry.path, entry.name)
      }
      navigate('/player')
    }
  }

  const browseReturnTo = useAppStore((s) => s.browseReturnTo)

  const navigateUp = () => {
    if (browseReturnTo) {
      useAppStore.getState().setBrowseReturnTo(null)
      navigate(browseReturnTo)
      return
    }
    const parts = browsePath.split('/').filter(Boolean)
    parts.pop()
    const parent = parts.length > 0 ? '/' + parts.join('/') : ''
    loadFolder(parent)
  }

  const pathParts = browsePath.split('/').filter(Boolean)

  // Which entries to show
  const isSearching = searchOpen && searchQuery.length >= 2

  const toggleFilter = (labelId: number) => {
    setActiveFilters((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId]
    )
  }

  // When filter active: flat list of ALL files with matching labels (across all folders)
  const isFiltering = activeFilters.length > 0
  const filteredEntries = isFiltering
    ? assignments
        .filter((a) => activeFilters.includes(a.label_id))
        .reduce<DropboxEntry[]>((acc, a) => {
          if (!acc.some((e) => e.path === a.dropbox_path)) {
            acc.push({
              name: a.dropbox_path.split('/').pop() || a.dropbox_path,
              path: a.dropbox_path,
              type: 'file',
            })
          }
          return acc
        }, [])
        .sort((a, b) => a.name.localeCompare(b.name))
    : entries

  const displayEntries = isSearching ? searchResults : filteredEntries

  // Folder name for parsing track filenames into badges
  const folderName = browsePath.split('/').filter(Boolean).pop() || ''

  // Show filter bar if user has any label assignments at all
  const hasAnyLabels = assignments.length > 0

  return (
    <div className="browse-page">
      {/* Sticky header area */}
      <div className="browse-header">
        {/* Topbar: search mode or normal with breadcrumb */}
        <div className="topbar">
          <span className="topbar-title">Dateien</span>
          {!searchOpen && (
            <>
              <button className="player-header-btn" style={{ marginLeft: 'auto' }} onClick={() => navigate('/favorites')}>
                <Heart size={18} />
              </button>
              {hasAnyLabels && labels.length > 0 && (
                <button
                  className="player-header-btn"
                  onClick={() => setFilterOpen(!filterOpen)}
                  style={activeFilters.length > 0 ? { color: 'var(--accent)' } : undefined}
                >
                  <SlidersHorizontal size={18} />
                </button>
              )}
              {isProMember && (
                <button className="player-header-btn" onClick={() => setRecordingOpen(true)}>
                  <Mic size={18} />
                </button>
              )}
              {isProMember && (
                <button className="player-header-btn" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={18} />
                </button>
              )}
              <button className="player-header-btn" onClick={openSearch}>
                <Search size={18} />
              </button>
              <button className="player-header-btn" onClick={() => navigate('/settings')}>
                <Settings size={18} />
              </button>
            </>
          )}
          {searchOpen && (
            <div className="search-bar" style={{ flex: 1 }}>
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
          )}
        </div>
        {!searchOpen && (
          <div className="topbar" style={{ minHeight: 36, padding: '4px 16px' }}>
            <div className="breadcrumb" style={{ flex: 1, padding: 0, border: 'none', background: 'none' }}>
              <span className="breadcrumb-item" onClick={() => loadFolder('')}>{rootName || 'Root'}</span>
              {pathParts.map((part, i) => {
                const path = '/' + pathParts.slice(0, i + 1).join('/')
                const isLast = i === pathParts.length - 1
                return (
                  <span key={path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    {isLast ? (
                      <span className="breadcrumb-current">{part}</span>
                    ) : (
                      <span className="breadcrumb-item" onClick={() => loadFolder(path)}>{part}</span>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* Label filter bar — toggleable */}
        {!isSearching && filterOpen && hasAnyLabels && labels.length > 0 && (
          <div className="filter-bar">
            <button
              className={`filter-chip ${activeFilters.length === 0 ? 'active' : ''}`}
              onClick={() => setActiveFilters([])}
            >
              Alle
            </button>
            {labels.map((l) => (
              <button
                key={l.id}
                className={`filter-chip ${activeFilters.includes(l.id) ? 'active' : ''}`}
                style={activeFilters.includes(l.id) ? { background: l.color + '25', color: l.color, borderColor: l.color } : {}}
                onClick={() => toggleFilter(l.id)}
              >
                <span className="filter-chip-dot" style={{ background: l.color }} />
                {l.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="browse-content">

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
        {!isSearching && !isFiltering && browsePath && (
          <li className="file-item" onClick={navigateUp}>
            <div className="file-icon-box file-icon-folder">
              <ArrowLeft size={18} />
            </div>
          </li>
        )}
        {displayEntries.map((entry) => {
          const isActive = entry.type === 'file' && entry.path === currentPath
          const isFile = entry.type === 'file'
          const isRevealed = revealedPath === entry.path

          const itemContent = (
            <>
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
                <VoiceIcon filename={entry.name} folderName={folderName} />
              )}
              <div className="file-info">
                <div className={`file-name ${isActive ? 'file-name--active' : ''}`}>
                  {entry.type === 'file' ? formatDisplayName(entry.name) : entry.name}
                </div>
                {(isSearching || isFiltering) && (
                  <div className="file-meta">{entry.path}</div>
                )}
                {entry.type === 'file' && (
                  <div className="file-meta">
                    {!isSearching && entry.size && (
                      <span>{(entry.size / 1024 / 1024).toFixed(1)} MB</span>
                    )}
                    <TrackBadges filename={entry.name} folderName={folderName} inline />
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
              <button
                className="file-actions-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setRevealedPath(revealedPath === entry.path ? null : entry.path)
                }}
              >
                <EllipsisVertical size={18} />
              </button>
            </>
          )

          const fav = isFavorite(entry.path)
          return (
            <li key={entry.path} className={`swipe-wrapper ${isRevealed ? 'swipe-revealed' : ''}`}>
              <div
                className={`swipe-content file-item ${isActive ? 'file-item--active' : ''}`}
                onClick={() => handleEntryClick(entry)}
                onTouchStart={handleSwipeStart}
                onTouchEnd={(e) => handleSwipeEnd(entry.path, e)}
              >
                {itemContent}
              </div>
              <div className="swipe-actions">
                <button
                  className="swipe-action-btn swipe-action-fav"
                  onClick={(e) => { e.stopPropagation(); toggleFav(entry.path, isFile ? 'file' : 'folder') }}
                >
                  <Heart size={18} fill={fav ? 'currentColor' : 'none'} />
                </button>
                {isFile && (
                  <button
                    className="swipe-action-btn swipe-action-label"
                    onClick={(e) => { e.stopPropagation(); setSwipeLabelPath(swipeLabelPath === entry.path ? null : entry.path) }}
                  >
                    <Tag size={18} />
                  </button>
                )}
                {isFile && isProMember && (
                  <button
                    className="swipe-action-btn swipe-action-info"
                    onClick={(e) => { e.stopPropagation(); setRevealedPath(null); navigate(`/file-settings?path=${encodeURIComponent(entry.path)}`) }}
                  >
                    <Info size={18} />
                  </button>
                )}
                {isFile && canDelete && (
                  <button
                    className="swipe-action-btn swipe-action-delete"
                    onClick={(e) => { e.stopPropagation(); setConfirmEntry(entry) }}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      </div>{/* end browse-content */}

      {/* Label Picker Overlay */}
      {swipeLabelPath && (
        <div className="confirm-overlay" onClick={() => setSwipeLabelPath(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title">Labels</p>
            <div className="label-picker" style={{ margin: 0 }}>
              {labels.map((l) => {
                const assigned = isAssigned(swipeLabelPath, l.id)
                return (
                  <button
                    key={l.id}
                    className={`label-picker-item ${assigned ? 'assigned' : ''}`}
                    style={{
                      borderColor: assigned ? l.color : 'var(--border)',
                      background: assigned ? l.color + '25' : 'none',
                      color: assigned ? l.color : 'var(--text-secondary)',
                    }}
                    onClick={() => toggleLabel(swipeLabelPath, l.id)}
                  >
                    <span className="label-picker-dot" style={{ background: l.color }} />
                    {l.name}
                  </button>
                )
              })}
            </div>
            <div className="confirm-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-secondary" onClick={() => setSwipeLabelPath(null)}>
                Fertig
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmEntry && (
        <div className="confirm-overlay" onClick={() => !deleting && setConfirmEntry(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title">Datei löschen?</p>
            <p className="confirm-filename">{confirmEntry.name}</p>
            <p className="confirm-hint">Wird unwiderruflich aus der Dropbox gelöscht.</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmEntry(null)} disabled={deleting}>
                Abbrechen
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Löschen...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={platform.isIOS ? '.mp3,.m4a,.ogg,.opus,.webm,.wav,.mid,.midi' : 'audio/*,.mp3,.m4a,.ogg,.opus,.webm,.wav,.mid,.midi'}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            setImportedFile(file)
            setRecordingOpen(true)
          }
          e.target.value = ''
        }}
      />

      {recordingOpen && (
        <RecordingModal
          targetPath={browsePath}
          onClose={() => { setRecordingOpen(false); setImportedFile(undefined) }}
          onUploadComplete={() => loadFolder(browsePath)}
          importedFile={importedFile}
        />
      )}
    </div>
  )
}
