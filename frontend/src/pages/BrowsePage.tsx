import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Folder, FolderPlus, ChevronLeft, ChevronRight, Search, X, Heart, Mic, Upload, Trash2, SlidersHorizontal, Settings, Tag, EllipsisVertical, Pencil, FileText, Video, File, Music, Volume2, Layers, Check, RefreshCw } from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAppStore } from '@/stores/appStore.ts'
import { useBrowseStore } from '@/stores/browseStore.ts'
import { useFavoritesStore } from '@/hooks/useFavorites.ts'
import { useLabelsStore } from '@/hooks/useLabels.ts'
import { RecordingModal } from '@/components/ui/RecordingModal'
import { ImportModal } from '@/components/ui/ImportModal'
import { RenameModal } from '@/components/ui/RenameModal'
import { VideoModal } from '@/components/ui/VideoModal'
import { useDocumentsStore } from '@/hooks/useDocuments.ts'
import { useSelectedDocumentStore } from '@/hooks/useSelectedDocument.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { formatDisplayName, formatTime } from '@/utils/formatters.ts'
import { stripFolderExtension, isReservedName, isSongFolder } from '@/utils/folderTypes.ts'
import SkeletonList from '@/components/ui/SkeletonList'
import type { BrowseResponse, DropboxEntry } from '@/types/index.ts'

interface SearchResponse {
  query: string
  entries: DropboxEntry[]
}

export function BrowsePage() {
  const navigate = useNavigate()
  const browsePath = useAppStore((s) => s.browsePath)
  const currentPath = usePlayerStore((s) => s.currentPath)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const { favorites, loaded: favsLoaded, load: loadFavs, isFavorite, toggle: toggleFav } = useFavoritesStore()
  const { labels, loaded: labelsLoaded, load: loadLabels, getLabelsForPath, isAssigned, toggleLabel, assignments } = useLabelsStore()
  const user = useAuthStore((s) => s.user)
  const canDelete = hasMinRole(user?.role ?? 'guest', 'chorleiter')
  const isAdmin = hasMinRole(user?.role ?? 'guest', 'admin')
  const isProMember = hasMinRole(user?.role ?? 'guest', 'pro-member')
  const { currentEntries: entries, loading, refreshing, error: browseError, loadFolder: storeLoadFolder } = useBrowseStore()
  const [mutationError, setMutationError] = useState('')
  const error = browseError || mutationError
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

  const loadFolder = useCallback((path: string, forceRefresh = false) => {
    setRevealedPath(null)
    storeLoadFolder(path, forceRefresh)
  }, [storeLoadFolder])

  useEffect(() => {
    loadFolder(browsePath)
    if (!favsLoaded) loadFavs()
    if (!labelsLoaded) loadLabels()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic background refresh (every 2 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        storeLoadFolder(browsePath)
      }
    }, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [browsePath, storeLoadFolder])

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
      setMutationError(err instanceof Error ? err.message : 'Fehler beim Löschen')
      setConfirmEntry(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleSongClick = async (entry: DropboxEntry) => {
    try {
      const audioPath = `${entry.path}/Audio`
      const data = await api<BrowseResponse>(`/dropbox/browse?path=${encodeURIComponent(audioPath)}`)
      const audioFiles = data.entries.filter((e) => e.type === 'file' && /\.(mp3|m4a|wav|ogg|flac|aac|webm)$/i.test(e.name))
      if (audioFiles.length > 0) {
        const first = audioFiles[0]
        usePlayerStore.getState().setTrack(first.path, first.name)
      }
    } catch {
      // Fallback: open folder normally
      closeSearch()
      loadFolder(entry.path)
    }
  }

  const handleEntryClick = (entry: DropboxEntry) => {
    if (didSwipeRef.current) { didSwipeRef.current = false; return }
    if (revealedPath) { setRevealedPath(null); return }
    if (entry.type === 'folder' && isSongFolder(entry.name)) {
      handleSongClick(entry)
    } else if (entry.type === 'folder' && entry.folder_type === 'texte') {
      closeSearch()
      useAppStore.getState().setBrowseReturnTo(null)
      loadFolder(entry.path)
    } else if (entry.type === 'folder') {
      closeSearch()
      useAppStore.getState().setBrowseReturnTo(null)
      loadFolder(entry.path)
    } else if (entry.type === 'document') {
      // entry.path is like /Song.song/Texte/mytext.txt — parent is the Texte folder
      const folderPath = entry.path.split('/').slice(0, -1).join('/') || ''
      navigate(`/doc-viewer?folder=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(entry.name)}`)
    } else if (entry.type === 'file' && entry.name.toLowerCase().endsWith('.mp4')) {
      setVideoEntry(entry)
    } else {
      if (entry.path !== currentPath) {
        usePlayerStore.getState().setTrack(entry.path, entry.name)
      }
      usePlayerStore.getState().setPlaying(true)
    }
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

  // Folder name for parsing track filenames — use .song ancestor if inside reserved folder
  const browseSegments = browsePath.split('/').filter(Boolean)
  const lastSegment = browseSegments[browseSegments.length - 1] || ''
  const folderName = isReservedName(lastSegment) && browseSegments.length >= 2
    ? stripFolderExtension(browseSegments[browseSegments.length - 2])
    : stripFolderExtension(lastSegment)

  // Detect if we're inside a .song folder (or its reserved subfolder)
  const songAncestorIdx = browseSegments.findIndex((s) => isSongFolder(s))
  const isInsideSong = songAncestorIdx >= 0
  const songParentPath = isInsideSong && songAncestorIdx > 0
    ? '/' + browseSegments.slice(0, songAncestorIdx).join('/')
    : ''

  // Detect if we're inside a Texte folder
  const isInTexteFolder = lastSegment.toLowerCase() === 'texte'
  // Song folder path for selected doc (go up one level from Texte)
  const songFolderPath = isInTexteFolder && browseSegments.length >= 2
    ? '/' + browseSegments.slice(0, -1).join('/')
    : ''
  const { selectedDoc, loadSelected: loadSelectedDoc, select: selectDoc } = useSelectedDocumentStore()

  useEffect(() => {
    if (isInTexteFolder && songFolderPath) {
      loadSelectedDoc(songFolderPath)
    }
  }, [isInTexteFolder, songFolderPath, loadSelectedDoc])

  // Voice lookup for colors (shortcode → label info)
  const voiceLookup = Object.fromEntries(labels.filter((l) => l.category === 'Stimme').map((l) => [l.shortcode || l.name, { name: l.name, color: l.color }]))

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
      setMutationError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
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
      setMutationError(msg)
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
      setMutationError(err instanceof Error ? err.message : 'Fehler beim Umbenennen')
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
          <span className="topbar-title"></span>
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
              <button className="player-header-btn" onClick={() => loadFolder(browsePath, true)}>
                <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
              </button>
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
            {isInsideSong && !isProMember ? (
              /* Member inside .song: back button to parent folder */
              <div className="breadcrumb" style={{ flex: 1, padding: 0, border: 'none', background: 'none' }}>
                <span className="breadcrumb-item" onClick={() => loadFolder(songParentPath)} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <ChevronLeft size={16} />
                  {stripFolderExtension(browseSegments[songAncestorIdx] || '')}
                </span>
              </div>
            ) : (
              /* Pro-member+ or outside .song: full breadcrumb */
              <div className="breadcrumb" style={{ flex: 1, padding: 0, border: 'none', background: 'none' }}>
                <span className="breadcrumb-item" onClick={() => loadFolder('')}>{user?.choir_name || 'Dateien'}</span>
                {pathParts.map((part, i) => {
                  const path = '/' + pathParts.slice(0, i + 1).join('/')
                  const isLast = i === pathParts.length - 1
                  const displayPart = stripFolderExtension(part)
                  return (
                    <span key={path} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      {isLast ? (
                        <span className="breadcrumb-current">{displayPart}</span>
                      ) : (
                        <span className="breadcrumb-item" onClick={() => loadFolder(path)}>{displayPart}</span>
                      )}
                    </span>
                  )
                })}
              </div>
            )}
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
      {(loading || searching) && <SkeletonList variant="cards" />}

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
      {!loading && !searching && <ul
        className="file-list file-list--cards"
        onClick={(e) => {
          if (revealedPath && e.target === e.currentTarget) setRevealedPath(null)
        }}
      >
        {displayEntries.map((entry) => {
          const isActive = entry.type === 'file' && entry.path === currentPath
          const isSongActive = entry.folder_type === 'song' && currentPath != null && currentPath.startsWith(entry.path + '/')
          const isFile = entry.type === 'file'
          const isDoc = entry.type === 'document'
          const isTexteFolder = entry.folder_type === 'texte'
          const isRevealed = revealedPath === entry.path

          const docIcon = isDoc ? (
            entry.name.toLowerCase().endsWith('.pdf') ? <FileText size={18} /> :
            entry.name.toLowerCase().endsWith('.txt') ? <File size={18} /> :
            <Video size={18} />
          ) : null

          const folderIcon = entry.type === 'folder' ? (
            entry.folder_type === 'song' ? <Music size={18} /> :
            entry.folder_type === 'texte' ? <FileText size={18} /> :
            entry.folder_type === 'audio' ? <Volume2 size={18} /> :
            entry.folder_type === 'videos' ? <Video size={18} /> :
            entry.folder_type === 'multitrack' ? <Layers size={18} /> :
            <Folder size={18} />
          ) : null

          const isMediaEntry = isFile || isDoc

          // Voice tags from backend-parsed metadata
          const voiceTags: { letter: string; name: string; color: string }[] = []
          if (isMediaEntry && entry.voice_keys) {
            for (const key of entry.voice_keys.split(',')) {
              const info = voiceLookup[key]
              voiceTags.push({ letter: key, name: info?.name || key, color: info?.color || 'var(--accent)' })
            }
          }
          // Sections from backend metadata
          const sections = isMediaEntry && entry.section_keys
            ? entry.section_keys.split(',').map((s) => s.replace(/(\d)/, ' $1'))
            : []
          // Song name and free text from backend
          const songName = isMediaEntry ? (entry.song_name || folderName) : ''
          const freeText = isMediaEntry ? (entry.free_text || '') : ''

          // Zugewiesene Labels nach Kategorie trennen
          const allTrackLabels = isMediaEntry ? getLabelsForPath(entry.path) : []
          const assignedVoiceLabels = allTrackLabels.filter((l) => l.category === 'Stimme')
          const generalLabels = allTrackLabels.filter((l) => l.category !== 'Stimme')

          // Zugewiesene Stimme-Labels in voiceTags mergen (dedupliziert)
          for (const vl of assignedVoiceLabels) {
            if (!voiceTags.some((v) => v.name === vl.name)) {
              voiceTags.push({ letter: vl.shortcode || vl.name[0], name: vl.name, color: vl.color })
            }
          }
          voiceTags.sort((a, b) => a.name.localeCompare(b.name))

          const itemContent = (
            <>
              {entry.type === 'folder' && entry.folder_type !== 'song' ? (
                <div className={`file-icon-box ${isTexteFolder ? 'file-icon-doc' : 'file-icon-folder'}${entry.folder_type === 'audio' ? ' folder-audio' : ''}${entry.folder_type === 'videos' ? ' folder-videos' : ''}${entry.folder_type === 'multitrack' ? ' folder-multitrack' : ''}`}>
                  {folderIcon}
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
              ) : null}
              <div className="file-info">
                <div className={`file-name ${isActive || isSongActive ? 'file-name--active' : ''}`}>
                  {isSongActive && <Volume2 size={14} style={{ flexShrink: 0, marginRight: 4 }} />}
                  {isMediaEntry && entry.song_name
                    ? songName
                    : (isFile || isDoc)
                      ? formatDisplayName(entry.display_name || entry.name)
                      : (entry.display_name || entry.name)}
                  {(entry.selected || (isInTexteFolder && isDoc && selectedDoc?.id === entry.doc_id)) && (
                    <Check size={14} className="file-name-selected" />
                  )}
                </div>
                {entry.doc_count != null && entry.doc_count > 0 && entry.folder_type !== 'song' && (
                  <div className="file-meta">
                    {entry.doc_count} {entry.doc_count === 1
                      ? (isTexteFolder ? 'Dokument' : 'Datei')
                      : (isTexteFolder ? 'Dokumente' : 'Dateien')}
                  </div>
                )}
                {/* .song folder: brick row (first sub-line) + user labels */}
                {entry.folder_type === 'song' && (() => {
                  const songLabels = getLabelsForPath(entry.path).filter((l) => l.category !== 'Stimme')
                  return (
                    <>
                      {(entry.sub_folders?.length || entry.selected_doc) && (
                        <div className="meta-bricks">
                          {entry.selected_doc && (
                            <button
                              className="meta-brick meta-brick--doc"
                              onClick={(e) => {
                                e.stopPropagation()
                                const textePath = entry.path + '/Texte'
                                loadFolder(textePath)
                              }}
                            >
                              <FileText size={14} />
                              {entry.selected_doc.name.replace(/\.[^.]+$/, '')}
                            </button>
                          )}
                          {entry.sub_folders?.map((sf) => (
                            <button
                              key={sf.type}
                              className={`meta-brick meta-brick--${sf.type}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                loadFolder(sf.path)
                              }}
                            >
                              {sf.type === 'texte' ? <FileText size={14} /> :
                               sf.type === 'audio' ? <Volume2 size={14} /> :
                               sf.type === 'videos' ? <Video size={14} /> :
                               <Layers size={14} />}
                              {sf.count}
                            </button>
                          ))}
                        </div>
                      )}
                      {songLabels.length > 0 && (
                        <div className="meta-line3">
                          {songLabels.map((l) => (
                            <span key={l.id} className="meta-label" style={{ color: l.color }}>{l.name}</span>
                          ))}
                        </div>
                      )}
                    </>
                  )
                })()}
                {(isSearching || isFiltering) && (
                  <div className="file-meta">{entry.path}</div>
                )}
                {isMediaEntry && (entry.duration || voiceTags.length > 0) && (
                  <div className="meta-line1">
                    {!isSearching && entry.duration && (
                      <span className={`meta-duration${voiceTags.length > 0 ? ' meta-duration--sep' : ''}`}>
                        {formatTime(entry.duration)}
                      </span>
                    )}
                    {voiceTags.map((v) => (
                      <span key={v.letter} className="meta-voice-tag" style={{ color: v.color }}>
                        <span className="meta-voice-dot" style={{ background: v.color }} />
                        {v.name}
                      </span>
                    ))}
                  </div>
                )}
                {isMediaEntry && sections.length > 0 && (
                  <div className="meta-line2">
                    {sections.map((s) => (
                      <span key={s} className="meta-section">{s}</span>
                    ))}
                  </div>
                )}
                {isMediaEntry && generalLabels.length > 0 && (
                  <div className="meta-line3">
                    {generalLabels.map((l) => (
                      <span key={l.id} className="meta-label" style={{ color: l.color }}>
                        {l.name}
                      </span>
                    ))}
                  </div>
                )}
                {isMediaEntry && freeText && (
                  <div className="meta-line4">{freeText.replace(/-/g, ' ')}</div>
                )}
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
                className={`swipe-content file-item ${isActive ? 'file-item--active' : ''}${isSongActive ? ' file-item--song-active' : ''}`}
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
                {isInTexteFolder && isDoc && entry.doc_id && (
                  <button
                    className={`swipe-action-btn swipe-action-select${selectedDoc?.id === entry.doc_id ? ' swipe-action-select--active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); selectDoc(songFolderPath, entry.doc_id!) }}
                  >
                    <Check size={18} />
                  </button>
                )}
                {(isFile || isDoc || entry.folder_type === 'song') && !isTexteFolder && (
                  <button
                    className="swipe-action-btn swipe-action-label"
                    onClick={(e) => { e.stopPropagation(); setSwipeLabelPath(swipeLabelPath === entry.path ? null : entry.path) }}
                  >
                    <Tag size={18} />
                  </button>
                )}
                {(isAdmin || (isDoc && isProMember)) && !isTexteFolder && (
                  <button
                    className="swipe-action-btn swipe-action-info"
                    onClick={(e) => { e.stopPropagation(); setRevealedPath(null); setRenameName(entry.name); setRenameEntry(entry) }}
                  >
                    <Pencil size={18} />
                  </button>
                )}
                {((isFile || isDoc) ? canDelete : isAdmin) && !isTexteFolder && (
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
            {labels.filter((l) => l.category !== 'Stimme').map((l) => {
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
          filename={confirmEntry.display_name || confirmEntry.name}
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

      {renameEntry && (renameEntry.type === 'file' || renameEntry.type === 'document') && (
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
