import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Folder, FolderPlus, FolderOpen, ArrowLeft, ChevronRight, Search, X, Heart, Mic, Upload, Trash2, SlidersHorizontal, Settings, Tag, EllipsisVertical, Home, Pencil, FileText, Video, File } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAppStore } from '@/stores/appStore.ts'
import { useFavoritesStore } from '@/hooks/useFavorites.ts'
import { useLabelsStore } from '@/hooks/useLabels.ts'
import { RecordingModal } from '@/components/ui/RecordingModal'
import { ImportModal } from '@/components/ui/ImportModal'
import { RenameModal } from '@/components/ui/RenameModal'
import { VideoModal } from '@/components/ui/VideoModal'
import { TrackBadges } from '@/components/ui/TrackBadges'
import { VoiceIcon } from '@/components/ui/VoiceIcon'
import { useDocumentsStore } from '@/hooks/useDocuments.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { formatDisplayName, formatTime } from '@/utils/formatters.ts'
import SkeletonList from '@/components/ui/SkeletonList'
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
  const { favorites, loaded: favsLoaded, load: loadFavs, isFavorite, toggle: toggleFav } = useFavoritesStore()
  const { labels, loaded: labelsLoaded, load: loadLabels, getLabelsForPath, isAssigned, toggleLabel, assignments } = useLabelsStore()
  const user = useAuthStore((s) => s.user)
  const canDelete = hasMinRole(user?.role ?? 'guest', 'chorleiter')
  const isAdmin = hasMinRole(user?.role ?? 'guest', 'admin')
  const isProMember = hasMinRole(user?.role ?? 'guest', 'pro-member')
  const [entries, setEntries] = useState<DropboxEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recordingOpen, setRecordingOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importedFiles, setImportedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Swipe-to-delete state
  const [revealedPath, setRevealedPath] = useState<string | null>(null)
  const [swipeLabelPath, setSwipeLabelPath] = useState<string | null>(null)
  const [confirmEntry, setConfirmEntry] = useState<DropboxEntry | null>(null)
  const [deleting, setDeleting] = useState(false)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const didSwipeRef = useRef(false)

  // Folder create state
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [creating, setCreating] = useState(false)

  // Rename state
  const [renameEntry, setRenameEntry] = useState<DropboxEntry | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)

  // Video modal state
  const [videoEntry, setVideoEntry] = useState<DropboxEntry | null>(null)

  // Kebab menu state
  const [kebabOpen, setKebabOpen] = useState(false)

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
      if (confirmEntry.type === 'document') {
        if (confirmEntry.doc_id) {
          await api(`/documents/${confirmEntry.doc_id}`, { method: 'DELETE' })
        } else {
          // Fallback: strip /Texte/<name> to get DB folder_path
          const folderPath = confirmEntry.path.split('/').slice(0, -2).join('/') || ''
          const listData = await api<{ documents: Array<{ id: number; original_name: string }> }>(
            `/documents/list?folder=${encodeURIComponent(folderPath)}`
          )
          const match = listData.documents.find((d) => d.original_name === confirmEntry.name)
          if (match) {
            await api(`/documents/${match.id}`, { method: 'DELETE' })
          }
        }
      } else {
        await api(`/dropbox/file?path=${encodeURIComponent(confirmEntry.path)}`, { method: 'DELETE' })
        if (confirmEntry.path === currentPath) {
          usePlayerStore.setState({ currentPath: null, currentName: null, isPlaying: false })
        }
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
    } else if (entry.type === 'texte') {
      navigate(`/doc-viewer?folder=${encodeURIComponent(entry.path)}`)
    } else if (entry.type === 'document') {
      // entry.path is like /SomeSong/Texte/mytext.txt — strip /Texte/<name> to get the DB folder path
      const folderPath = entry.path.split('/').slice(0, -2).join('/') || ''
      navigate(`/doc-viewer?folder=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(entry.name)}`)
    } else if (entry.type === 'file' && entry.name.toLowerCase().endsWith('.mp4')) {
      setVideoEntry(entry)
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

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || creating) return
    setCreating(true)
    try {
      await api('/dropbox/folder', { method: 'POST', body: { name: newFolderName.trim(), path: browsePath } })
      setNewFolderName('')
      setCreateFolderOpen(false)
      await loadFolder(browsePath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteFolder = async () => {
    if (!confirmEntry || deleting) return
    setDeleting(true)
    try {
      await api(`/dropbox/folder?path=${encodeURIComponent(confirmEntry.path)}`, { method: 'DELETE' })
      setConfirmEntry(null)
      setRevealedPath(null)
      await loadFolder(browsePath)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Fehler beim Loeschen'
      setError(msg)
      setConfirmEntry(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleRename = async () => {
    if (!renameEntry || !renameName.trim() || renaming) return
    setRenaming(true)
    try {
      await api('/dropbox/rename', { method: 'POST', body: { path: renameEntry.path, new_name: renameName.trim() } })
      setRenameEntry(null)
      setRevealedPath(null)
      await loadFolder(browsePath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Umbenennen')
      setRenameEntry(null)
    } finally {
      setRenaming(false)
    }
  }

  return (
    <div className="browse-page">
      {/* Sticky header area */}
      <div className="browse-header">
        {/* Topbar: search mode or normal with breadcrumb */}
        <div className="topbar">
          <span className="topbar-title">{user?.choir_name || 'Dateien'}</span>
          {!searchOpen && (
            <>
              <button className="player-header-btn" style={{ marginLeft: 'auto', ...(favorites.length > 0 ? { color: 'var(--accent)' } : {}) }} onClick={() => navigate('/favorites')}>
                <Heart size={18} fill={favorites.length > 0 ? 'currentColor' : 'none'} />
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
              <button className="player-header-btn" onClick={openSearch}>
                <Search size={18} />
              </button>
              <button className="player-header-btn" onClick={() => navigate('/settings')}>
                <Settings size={18} />
              </button>
              {isProMember && (
                <div style={{ position: 'relative' }}>
                  <button className="player-header-btn" onClick={() => setKebabOpen(!kebabOpen)}>
                    <EllipsisVertical size={18} />
                  </button>
                  {kebabOpen && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setKebabOpen(false)} />
                      <div style={{
                        position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 100,
                        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-lg)', padding: 'var(--space-2) 0',
                        minWidth: 200, boxShadow: 'var(--shadow-lg)',
                      }}>
                        {browsePath && (
                          <button className="kebab-item" onClick={() => { setKebabOpen(false); setRecordingOpen(true) }}>
                            <Mic size={16} /> Aufnehmen
                          </button>
                        )}
                        {browsePath && (
                          <button className="kebab-item" onClick={() => { setKebabOpen(false); fileInputRef.current?.click() }}>
                            <Upload size={16} /> Datei(en) hochladen
                          </button>
                        )}
                        {isAdmin && (
                          <button className="kebab-item" onClick={() => { setKebabOpen(false); setNewFolderName(''); setCreateFolderOpen(true) }}>
                            <FolderPlus size={16} /> Ordner erstellen
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
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
              <span className="breadcrumb-item" onClick={() => loadFolder('')} style={{ display: 'flex', alignItems: 'center' }}><Home size={14} /></span>
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
      {(loading || searching) && <SkeletonList />}

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
      {!loading && !searching && <ul className="file-list">
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
          const isDoc = entry.type === 'document'
          const isTexte = entry.type === 'texte'
          const isRevealed = revealedPath === entry.path

          const docIcon = isDoc ? (
            entry.name.toLowerCase().endsWith('.pdf') ? <FileText size={18} /> :
            entry.name.toLowerCase().endsWith('.txt') ? <File size={18} /> :
            <Video size={18} />
          ) : null

          const itemContent = (
            <>
              {entry.type === 'folder' ? (
                <div className="file-icon-box file-icon-folder">
                  <Folder size={18} />
                </div>
              ) : isTexte ? (
                <div className="file-icon-box file-icon-doc">
                  <FileText size={18} />
                </div>
              ) : isDoc ? (
                <div className="file-icon-box file-icon-doc">
                  {docIcon}
                </div>
              ) : entry.type === 'file' && entry.name.toLowerCase().endsWith('.mp4') ? (
                <div className="file-icon-box file-icon-doc">
                  <Video size={18} />
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
                {isTexte && entry.doc_count != null && (
                  <div className="file-meta">
                    {entry.doc_count} {entry.doc_count === 1 ? 'Dokument' : 'Dokumente'}
                  </div>
                )}
                {(isSearching || isFiltering) && (
                  <div className="file-meta">{entry.path}</div>
                )}
                {entry.type === 'file' && (
                  <div className="file-meta">
                    {!isSearching && entry.duration && (
                      <span>{formatTime(entry.duration)}</span>
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
                  onClick={(e) => { e.stopPropagation(); toggleFav(entry.path, entry.type === 'folder' ? 'folder' : 'file') }}
                >
                  <Heart size={18} fill={fav ? 'currentColor' : 'none'} />
                </button>
                {isTexte && isProMember && (
                  <button
                    className="swipe-action-btn swipe-action-info"
                    onClick={(e) => { e.stopPropagation(); setRevealedPath(null); loadFolder(entry.path + '/Texte') }}
                  >
                    <FolderOpen size={18} />
                  </button>
                )}
                {(isFile || isDoc) && !isTexte && (
                  <button
                    className="swipe-action-btn swipe-action-label"
                    onClick={(e) => { e.stopPropagation(); setSwipeLabelPath(swipeLabelPath === entry.path ? null : entry.path) }}
                  >
                    <Tag size={18} />
                  </button>
                )}
                {(isAdmin || (isDoc && isProMember)) && !isTexte && (
                  <button
                    className="swipe-action-btn swipe-action-info"
                    onClick={(e) => { e.stopPropagation(); setRevealedPath(null); setRenameName(entry.name); setRenameEntry(entry) }}
                  >
                    <Pencil size={18} />
                  </button>
                )}
                {((isFile || isDoc) ? canDelete : isAdmin) && !isTexte && (
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
      </ul>}

      </div>{/* end browse-content */}

      {/* Label Picker Overlay */}
      {swipeLabelPath && (
        <ConfirmDialog
          title="Labels"
          onClose={() => setSwipeLabelPath(null)}
          confirmLabel="Fertig"
          onConfirm={() => setSwipeLabelPath(null)}
          cancelLabel={null}
          variant="secondary"
        >
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
        </ConfirmDialog>
      )}

      {confirmEntry && (
        <ConfirmDialog
          title={confirmEntry.type === 'folder' ? 'Ordner loeschen?' : 'Datei loeschen?'}
          filename={confirmEntry.name}
          hint={confirmEntry.type === 'folder'
            ? 'Nur leere Ordner koennen geloescht werden.'
            : 'Wird unwiderruflich aus der Dropbox geloescht.'}
          onClose={() => setConfirmEntry(null)}
          confirmLabel="Loeschen"
          confirmLoadingLabel="Loeschen..."
          onConfirm={confirmEntry.type === 'folder' ? handleDeleteFolder : handleDelete}
          loading={deleting}
        />
      )}

      {createFolderOpen && (
        <ConfirmDialog
          title="Ordner erstellen"
          onClose={() => setCreateFolderOpen(false)}
          confirmLabel="Erstellen"
          confirmLoadingLabel="Erstellen..."
          onConfirm={handleCreateFolder}
          loading={creating}
          confirmDisabled={!newFolderName.trim()}
          variant="primary"
        >
          <input
            className="auth-input"
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Ordnername"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
          />
        </ConfirmDialog>
      )}

      {renameEntry && renameEntry.type === 'folder' && (
        <ConfirmDialog
          title="Ordner umbenennen"
          onClose={() => setRenameEntry(null)}
          confirmLabel="Speichern"
          confirmLoadingLabel="Speichern..."
          onConfirm={handleRename}
          loading={renaming}
          confirmDisabled={!renameName.trim()}
          variant="primary"
        >
          <input
            className="auth-input"
            type="text"
            value={renameName}
            onChange={(e) => setRenameName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
          />
        </ConfirmDialog>
      )}

      {renameEntry && renameEntry.type === 'file' && (
        <RenameModal
          path={renameEntry.path}
          currentName={renameEntry.name}
          folderPath={browsePath}
          onClose={() => setRenameEntry(null)}
          onRenamed={() => { setRenameEntry(null); loadFolder(browsePath) }}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".mp3,.m4a,.ogg,.opus,.webm,.wav,.mid,.midi,.pdf,.mp4,.mov,.txt,video/mp4"
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = e.target.files
          if (files && files.length > 0) {
            setImportedFiles(Array.from(files))
            setImportOpen(true)
          }
          e.target.value = ''
        }}
      />

      {recordingOpen && (
        <RecordingModal
          targetPath={browsePath}
          onClose={() => setRecordingOpen(false)}
          onUploadComplete={() => loadFolder(browsePath)}
        />
      )}

      {videoEntry && (
        <VideoModal
          path={videoEntry.path}
          name={videoEntry.name}
          onClose={() => setVideoEntry(null)}
        />
      )}

      {importOpen && importedFiles.length > 0 && (
        <ImportModal
          files={importedFiles}
          targetPath={browsePath}
          isAdmin={isAdmin}
          onClose={() => { setImportOpen(false); setImportedFiles([]) }}
          onUploadComplete={() => { loadFolder(browsePath); useDocumentsStore.setState({ loadedFolder: null }) }}
        />
      )}
    </div>
  )
}
