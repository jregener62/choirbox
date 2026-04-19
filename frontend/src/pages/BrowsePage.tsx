import { useState, useEffect, useCallback, useRef, createElement } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Folder, ChevronLeft, ChevronRight, Search, X, Heart, Mic, Trash2, SlidersHorizontal, Settings, Tag, EllipsisVertical, Pencil, FileText, Video, Music, Check, RefreshCw, Volume2, LogOut, Headphones, FileEdit, Copy } from 'lucide-react'
import { setDraft, unsetDraft } from '@/api/drafts'
import { FolderImportIcon } from '@/components/ui/FolderImportIcon'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAppStore } from '@/stores/appStore.ts'
import { useBrowseStore } from '@/stores/browseStore.ts'
import { useFavoritesStore } from '@/hooks/useFavorites.ts'
import { useLabelsStore } from '@/hooks/useLabels.ts'
import { useRecordingStore } from '@/stores/recordingStore'
import { deriveSongFolderPath } from '@/utils/folderTypes'
import { ImportModal } from '@/components/ui/ImportModal'
import { RenameModal } from '@/components/ui/RenameModal'
import { VideoModal } from '@/components/ui/VideoModal'
import { UploadChoiceModal } from '@/components/ui/UploadChoiceModal'
import { PasteTextModal } from '@/components/ui/PasteTextModal'
import { useDocumentsStore } from '@/hooks/useDocuments.ts'
import { useSelectedDocumentStore } from '@/hooks/useSelectedDocument.ts'
import { useShareTarget } from '@/hooks/useShareTarget'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole, isGuest } from '@/utils/roles.ts'
import { useViewModeStore } from '@/stores/viewModeStore.ts'
import { formatDisplayName, formatTime } from '@/utils/formatters.ts'
import { stripFolderExtension, isReservedName, isSongFolder } from '@/utils/folderTypes.ts'
import { getFolderTypeConfig } from '@/utils/folderTypeConfig'
import SkeletonList from '@/components/ui/SkeletonList'
import type { DropboxEntry, SubFolderInfo, FolderType } from '@/types/index.ts'

interface SearchResponse {
  query: string
  entries: DropboxEntry[]
}

// Reihenfolge der Typ-Buttons in Song-Kacheln / Song-Card-Header
const SUB_ORDER: Record<string, number> = { texte: 0, audio: 1, videos: 2, multitrack: 3 }
// Die drei primaeren Typen werden IMMER angezeigt — auch leer (Count 0 -> gedimmt)
const PRIMARY_SUB_TYPES: FolderType[] = ['texte', 'audio', 'videos']
const RESERVED_NAME_BY_TYPE: Record<FolderType, string> = {
  song: '', texte: 'Texte', audio: 'Audio', videos: 'Videos', multitrack: 'Multitrack',
}

// Ergaenzt fehlende primaere Typen mit count=0 Platzhaltern.
// Multitrack bleibt konditional (nur wenn vom Backend geliefert).
function padPrimarySubFolders(subs: SubFolderInfo[] | undefined, songPath: string): SubFolderInfo[] {
  const byType = new Map((subs || []).map((s) => [s.type, s]))
  const result: SubFolderInfo[] = []
  for (const type of PRIMARY_SUB_TYPES) {
    const existing = byType.get(type)
    if (existing) {
      result.push(existing)
    } else {
      const name = RESERVED_NAME_BY_TYPE[type]
      result.push({ type, name, path: `${songPath}/${name}`, count: 0 })
    }
  }
  const mt = byType.get('multitrack')
  if (mt) result.push(mt)
  return result
}

export function BrowsePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const location = useLocation()
  // URL-driven state: `p` = browse path, `q` = search query (presence ⇒ search mode).
  // Mutually exclusive in terms of display, so React Router history carries the whole
  // navigation context — browser back / navigate(-1) returns to the previous state.
  const urlQuery = searchParams.get('q')
  const browsePath = searchParams.get('p') || ''
  const searchOpen = urlQuery !== null
  const searchQuery = urlQuery || ''
  const highlightPath = useAppStore((s) => s.highlightPath)
  const currentPath = usePlayerStore((s) => s.currentPath)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const { loaded: favsLoaded, load: loadFavs, isFavorite, toggle: toggleFav } = useFavoritesStore()
  const { labels, loaded: labelsLoaded, load: loadLabels, getLabelsForPath, isAssigned, toggleLabel, assignments } = useLabelsStore()
  const user = useAuthStore((s) => s.user)
  const canDelete = hasMinRole(user?.role ?? 'guest', 'chorleiter')
  const isAdmin = hasMinRole(user?.role ?? 'guest', 'admin')
  const isProMember = hasMinRole(user?.role ?? 'guest', 'pro-member')
  const guest = isGuest(user?.role)
  const logout = useAuthStore((s) => s.logout)
  const sessionExpiresAt = useAuthStore((s) => s.sessionExpiresAt)
  const viewMode = useViewModeStore((s) => s.mode)
  const viewModeLocked = useViewModeStore((s) => s.locked)
  const setViewMode = useViewModeStore((s) => s.setMode)
  const isTexteMode = viewMode === 'texts'
  const guestExpiryLabel = guest && sessionExpiresAt
    ? sessionExpiresAt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    : null
  const { currentEntries: entries, currentSongSubFolders: songSubFolders, loading, refreshing, error: browseError, loadFolder: storeLoadFolder } = useBrowseStore()
  const [mutationError, setMutationError] = useState('')
  const error = browseError || mutationError
  const [importOpen, setImportOpen] = useState(false)
  const [importedFiles, setImportedFiles] = useState<File[]>([])
  const [uploadChoiceOpen, setUploadChoiceOpen] = useState(false)
  const [pasteMode, setPasteMode] = useState<null | 'txt' | 'cho'>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sharedFiles = useShareTarget()

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
  const [renameExt, setRenameExt] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)

  // Duplicate state — path des gerade laufenden Duplikats fuer Disabled-State
  const [duplicatingPath, setDuplicatingPath] = useState<string | null>(null)

  // Video modal state
  const [videoEntry, setVideoEntry] = useState<DropboxEntry | null>(null)

  // Track which .song folder was last visited
  const lastSongPathRef = useRef<string | null>(null)

  // Filter state
  const [activeFilters, setActiveFilters] = useState<number[]>([])
  const [filterOpen, setFilterOpen] = useState(false)
  const [showFavorites, setShowFavorites] = useState(false)

  // Search state — searchOpen + searchQuery are derived from URL above
  const [searchResults, setSearchResults] = useState<DropboxEntry[]>([])
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const loadFolder = useCallback((path: string, forceRefresh = false, opts?: { fromSearch?: boolean }) => {
    setRevealedPath(null)
    setShowFavorites(false)
    // Check whether the target matches the logical browse state already in the URL.
    // Pathname can be '/' (initial route) or '/browse' — both render BrowsePage,
    // so we compare the logical browse path (URL param `p`) not the pathname.
    const currentParams = new URLSearchParams(location.search)
    const currentP = currentParams.get('p') || ''
    const currentQ = currentParams.get('q')
    const alreadyOnPath = currentP === path && currentQ === null
    if (alreadyOnPath) {
      // No navigation needed — just refetch if requested
      if (forceRefresh) storeLoadFolder(path, true)
      return
    }
    if (forceRefresh) {
      // Ensure the URL-driven fetch delivers fresh data after navigation
      useBrowseStore.getState().invalidate(path)
    }
    navigate(
      { pathname: '/browse', search: path ? `?p=${encodeURIComponent(path)}` : '' },
      opts?.fromSearch ? { state: { fromSearch: true } } : undefined,
    )
  }, [navigate, storeLoadFolder, location.search])

  // URL is the single source of truth for the browse path: whenever `p` changes
  // (including on mount, on back/forward, or on a brick click), re-fetch via the
  // store. storeLoadFolder cache-hits are instant, so this is cheap.
  useEffect(() => {
    storeLoadFolder(browsePath)
  }, [browsePath, storeLoadFolder])

  useEffect(() => {
    // Gaeste haben weder Favoriten noch eigene Label-Zuweisungen auf dem Server.
    // load() wuerde 403 liefern — schon bevor wir das UI verstecken, wollen
    // wir die Requests gar nicht absetzen.
    if (!guest) {
      if (!favsLoaded) loadFavs()
    }
    if (!labelsLoaded) loadLabels()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Share Target: geteilte Dateien in ImportModal öffnen
  useEffect(() => {
    if (sharedFiles.length > 0) {
      setImportedFiles(sharedFiles)
      setImportOpen(true)
    }
  }, [sharedFiles])

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
    // Push a history entry for the search overlay so closing/back restores the
    // previous folder. fromPath is stored on the history entry and used by
    // closeSearchExplicit to return there.
    navigate(
      { pathname: '/browse', search: '?q=' },
      { state: { fromPath: browsePath } },
    )
    setTimeout(() => searchRef.current?.focus(), 100)
  }

  const closeSearchExplicit = () => {
    const state = location.state as { fromPath?: string } | null
    if (state?.fromPath !== undefined) {
      // Search was opened via openSearch() — unwind that push
      navigate(-1)
    } else {
      // Direct deep link to /browse?q=... — no history to unwind, go to root
      navigate({ pathname: '/browse', search: '' }, { replace: true })
    }
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

  const toggleDraft = async (entry: DropboxEntry) => {
    try {
      if (entry.type === 'document' && entry.doc_id) {
        if (entry.is_draft) {
          await unsetDraft('document', String(entry.doc_id))
          await unsetDraft('path', entry.path)
        } else {
          await setDraft('document', String(entry.doc_id))
          await setDraft('path', entry.path)
        }
      } else {
        if (entry.is_draft) {
          await unsetDraft('path', entry.path)
        } else {
          await setDraft('path', entry.path)
        }
      }
      setRevealedPath(null)
      await loadFolder(browsePath, true)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Fehler beim Markieren als Entwurf')
    }
  }

  const handleDuplicate = async (entry: DropboxEntry) => {
    if (duplicatingPath) return
    setDuplicatingPath(entry.path)
    setRevealedPath(null)
    try {
      await api('/dropbox/duplicate', { method: 'POST', body: { path: entry.path } })
      await loadFolder(browsePath, true)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Fehler beim Duplizieren')
    } finally {
      setDuplicatingPath(null)
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
      await loadFolder(browsePath, true)
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Fehler beim Löschen')
      setConfirmEntry(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleEntryClick = (entry: DropboxEntry) => {
    if (didSwipeRef.current) { didSwipeRef.current = false; return }
    if (revealedPath) { setRevealedPath(null); return }
    if (entry.type === 'folder' && isSongFolder(entry.name)) {
      if (isTexteMode) {
        const texteCount = entry.sub_folders?.find((sf) => sf.type === 'texte')?.count ?? 0
        if (texteCount === 1) {
          // Genau 1 Text → direkt zum Viewer, DocViewerPage oeffnet das
          // erste Dokument automatisch.
          navigate(`/doc-viewer?folder=${encodeURIComponent(entry.path + '/Texte')}`)
        } else if (texteCount > 1) {
          // Mehrere Texte → Ordner oeffnen, User waehlt selbst.
          loadFolder(entry.path + '/Texte', false, { fromSearch: searchOpen && searchQuery.length >= 2 })
        }
        return
      }
      // Song-Kachel ist nicht mehr klickbar — nur die Multi-Button-Leiste navigiert
      return
    } else if (entry.type === 'folder' && entry.folder_type === 'texte') {
      useAppStore.getState().setBrowseReturnTo(null)
      loadFolder(entry.path, false, { fromSearch: searchOpen && searchQuery.length >= 2 })
    } else if (entry.type === 'folder') {
      useAppStore.getState().setBrowseReturnTo(null)
      loadFolder(entry.path, false, { fromSearch: searchOpen && searchQuery.length >= 2 })
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

  const favFilteredEntries = showFavorites
    ? entries.filter((e) => isFavorite(e.path))
    : filteredEntries

  const displayEntries = isSearching ? searchResults : favFilteredEntries

  // Folder name for parsing track filenames — use .song ancestor if inside reserved folder
  const browseSegments = browsePath.split('/').filter(Boolean)
  const lastSegment = browseSegments[browseSegments.length - 1] || ''
  const folderName = isReservedName(lastSegment) && browseSegments.length >= 2
    ? stripFolderExtension(browseSegments[browseSegments.length - 2])
    : stripFolderExtension(lastSegment)

  // Detect if we're inside a .song folder (or its reserved subfolder)
  const songAncestorIdx = browseSegments.findIndex((s) => isSongFolder(s))
  const isInsideSong = songAncestorIdx >= 0

  // Remember the last visited .song folder path
  if (isInsideSong) {
    lastSongPathRef.current = '/' + browseSegments.slice(0, songAncestorIdx + 1).join('/')
  }

  // Active subfolder name within .song (e.g., 'Audio', 'Videos')
  const activeSubfolderName = isInsideSong && browseSegments.length > songAncestorIdx + 1
    ? browseSegments[songAncestorIdx + 1]
    : null
  // Im Texte-Modus braucht der User die Audio/Video-Tabs nicht —
  // der Segmented-Control wird nur im Song-Modus gezeigt.
  const showSegmentedControl = isInsideSong && !isTexteMode

  // Stop player when leaving .song folder
  useEffect(() => {
    if (!isInsideSong && usePlayerStore.getState().currentPath) {
      usePlayerStore.getState().setPlaying(false)
      usePlayerStore.setState({ currentPath: null, currentName: null })
    }
  }, [isInsideSong])

  // Detect which subfolder type we're inside
  const isInTexteFolder = lastSegment.toLowerCase() === 'texte'
  const parentFolderType = lastSegment.toLowerCase() as string
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

  // Scroll to and highlight a specific entry after upload
  useEffect(() => {
    if (!highlightPath || loading) return
    const match = entries.find((e) => e.path === highlightPath)
    if (!match) return
    // Clear highlight after processing
    useAppStore.getState().setHighlightPath(null)
    // Scroll to element after DOM update
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-path="${CSS.escape(highlightPath)}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('file-item--highlight')
        setTimeout(() => el.classList.remove('file-item--highlight'), 2000)
      }
    })
  }, [highlightPath, entries, loading])

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
      await loadFolder(browsePath, true)
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
      await loadFolder(browsePath, true)
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
      const fullName = renameExt ? renameName.trim() + renameExt : renameName.trim()
      await api('/dropbox/rename', { method: 'POST', body: { path: renameEntry.path, new_name: fullName } })
      setRenameEntry(null)
      setRevealedPath(null)
      await loadFolder(browsePath, true)
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
        {/* View-Bar: Song/Texte-Umschaltung — nur sichtbar fuer Members+
            auf Root-Level (nicht im Song-Ordner, nicht fuer Gaeste mit
            gelocktm Modus). Nutzt das gleiche meta-brick-Styling wie
            der Song-Header Segmented-Control. */}
        {!isInsideSong && !searchOpen && !viewModeLocked && (
          <div className="view-bar">
            <div className="meta-bricks">
              <button
                className={`meta-brick meta-brick--songs${!isTexteMode ? ' meta-brick--active' : ''}`}
                onClick={() => setViewMode('songs')}
              >
                <Headphones size={16} />
                {!isTexteMode && <span className="meta-brick__label">Songs</span>}
              </button>
              <button
                className={`meta-brick meta-brick--texte${isTexteMode ? ' meta-brick--active' : ''}`}
                onClick={() => setViewMode('texts')}
              >
                <FileText size={16} />
                {isTexteMode && <span className="meta-brick__label">Texte</span>}
              </button>
            </div>
          </div>
        )}

        {/* Topbar: search mode or normal with breadcrumb */}
        {isInsideSong ? (
          /* Inside .song: simplified header — sync left, mic+upload right */
          <div className="topbar">
            <button className="player-header-btn" onClick={() => loadFolder(browsePath, true)}>
              <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
            </button>
            <span style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {isProMember && (
                <button className="player-header-btn" onClick={() => {
                  const songFolder = deriveSongFolderPath(browsePath)
                  if (songFolder) {
                    useRecordingStore.getState().startSession(songFolder)
                  } else {
                    useRecordingStore.getState().startRootSession(browsePath || '/')
                  }
                }}>
                  <Mic size={18} />
                </button>
              )}
              {isProMember && (
                <button className="player-header-btn" onClick={() => setUploadChoiceOpen(true)} title="Hinzufuegen">
                  <FolderImportIcon size={18} />
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Outside .song: sync+settings left, favs+search+filter center, mic+upload right */
          <div className="topbar">
            {!searchOpen ? (
              <>
                {/* Left group */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button className="player-header-btn" onClick={() => loadFolder(browsePath, true)}>
                    <RefreshCw size={18} className={refreshing ? 'spin' : ''} />
                  </button>
                  {guest ? (
                    <>
                      <button
                        className="player-header-btn"
                        title={
                          guestExpiryLabel
                            ? `Gast-Session laeuft ab um ${guestExpiryLabel} — jetzt abmelden`
                            : 'Gast-Session beenden'
                        }
                        onClick={() => {
                          logout()
                          navigate('/login', { replace: true })
                        }}
                      >
                        <LogOut size={18} />
                      </button>
                      {guestExpiryLabel && (
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            padding: '0 4px',
                            whiteSpace: 'nowrap',
                          }}
                          title={`Gast-Session laeuft ab um ${guestExpiryLabel}`}
                        >
                          bis {guestExpiryLabel}
                        </span>
                      )}
                    </>
                  ) : (
                    <button className="player-header-btn" onClick={() => navigate('/settings')}>
                      <Settings size={18} />
                    </button>
                  )}
                </div>
                {/* Center group */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                  {!guest && (
                    <button className="player-header-btn" style={showFavorites ? { color: 'var(--accent)' } : undefined} onClick={() => {
                      if (!showFavorites) {
                        // Favoriten view lives at root — navigate there so breadcrumb + pathParts match
                        navigate({ pathname: '/browse', search: '' })
                        setShowFavorites(true)
                      } else {
                        setShowFavorites(false)
                      }
                    }}>
                      <Heart size={18} fill={showFavorites ? 'currentColor' : 'none'} />
                    </button>
                  )}
                  <button className="player-header-btn" onClick={openSearch}>
                    <Search size={18} />
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
                </div>
                {/* Right group — Mic/Upload nur im Song-Modus (im Texte-Modus nicht relevant) */}
                {!isTexteMode && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    {isProMember && (
                      <button className="player-header-btn" onClick={() => {
                        const songFolder = deriveSongFolderPath(browsePath)
                        if (songFolder) {
                          useRecordingStore.getState().startSession(songFolder)
                        } else {
                          useRecordingStore.getState().startRootSession(browsePath || '/')
                        }
                      }}>
                        <Mic size={18} />
                      </button>
                    )}
                    {isProMember && (
                      <button className="player-header-btn" onClick={() => setUploadChoiceOpen(true)} title="Hinzufuegen">
                        <FolderImportIcon size={18} />
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="search-bar" style={{ flex: 1 }}>
                <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <input
                  ref={searchRef}
                  className="search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => navigate(
                    { pathname: '/browse', search: `?q=${encodeURIComponent(e.target.value)}` },
                    { replace: true, state: location.state },
                  )}
                  placeholder="Dateien suchen..."
                  autoFocus
                />
                <button className="player-header-btn" onClick={closeSearchExplicit}>
                  <X size={18} />
                </button>
              </div>
            )}
          </div>
        )}
        {!searchOpen && isInsideSong && (
          /* Inside .song: back button only (all roles) */
          <div className="topbar" style={{ minHeight: 36, padding: '4px 16px' }}>
            <div className="breadcrumb" style={{ flex: 1, padding: 0, border: 'none', background: 'none' }}>
              <span className="breadcrumb-item" onClick={() => navigate(-1)} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <ChevronLeft size={16} />
                {(location.state as { fromSearch?: boolean } | null)?.fromSearch
                  ? 'Suche'
                  : stripFolderExtension(browseSegments[songAncestorIdx] || '')}
              </span>
            </div>
          </div>
        )}
        {!searchOpen && !isInsideSong && (
          /* Outside .song: full breadcrumb (all roles) */
          <div className="topbar" style={{ minHeight: 36, padding: '4px 16px' }}>
            <div className="breadcrumb" style={{ flex: 1, padding: 0, border: 'none', background: 'none' }}>
              <span className="breadcrumb-item" onClick={() => { setShowFavorites(false); loadFolder('') }}>{user?.choir_name || 'Dateien'}</span>
              {showFavorites && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span className="breadcrumb-current">Favoriten</span>
                </span>
              )}
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
          </div>
        )}

        {/* Song Card with subfolder badges (replaces SegmentedControl) */}
        {!searchOpen && showSegmentedControl && (() => {
          const songPath = '/' + browseSegments.slice(0, songAncestorIdx + 1).join('/')
          const sorted = padPrimarySubFolders(songSubFolders || [], songPath).sort(
            (a, b) => (SUB_ORDER[a.type] ?? 99) - (SUB_ORDER[b.type] ?? 99)
          )
          return (
          <div className="song-card-header">
            <div className="song-card-header__info">
              <div className="song-card-header__name">
                {stripFolderExtension(browseSegments[songAncestorIdx] || '')}
              </div>
              <div className="meta-bricks">
                {sorted.map((sf) => {
                  const config = getFolderTypeConfig(sf.type)
                  const isActive = sf.name.toLowerCase() === activeSubfolderName?.toLowerCase()
                  const isEmpty = sf.count === 0
                  return (
                    <button
                      key={sf.type}
                      className={`meta-brick meta-brick--${sf.type}${isActive ? ' meta-brick--active' : ''}${isEmpty ? ' meta-brick--empty' : ''}`}
                      onClick={() => loadFolder(sf.path)}
                      disabled={isEmpty}
                    >
                      {createElement(config.icon, { size: 16 })}
                      {isActive && <span className="meta-brick__label">{sf.name}</span>}
                      {sf.count}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
          )
        })()}

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

      {/* Loading: sync spinner for browse, skeleton for search */}
      {loading && !searching && (
        <div className="empty-state">
          <RefreshCw size={48} className="spin" style={{ opacity: 0.4 }} />
          <div style={{ marginTop: 'var(--space-3)', color: 'var(--text-muted)' }}>Synchronisiere...</div>
        </div>
      )}
      {searching && <SkeletonList variant="cards" />}

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
          ) : showFavorites ? (
            <>
              <Heart size={48} strokeWidth={1} style={{ opacity: 0.3 }} />
              <div>Noch keine Favoriten</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Markiere Songs mit dem Herz-Symbol
              </div>
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
          const isSongSelected = entry.folder_type === 'song' && entry.path === lastSongPathRef.current
          const isFile = entry.type === 'file'
          const isDoc = entry.type === 'document'
          const isTexteFolder = entry.folder_type === 'texte'
          const isRevealed = revealedPath === entry.path

          // File extension for badge text
          const fileExt = (isFile || isDoc) ? (entry.name.split('.').pop()?.toLowerCase() || '') : ''
          const isTextFile = fileExt === 'pdf' || fileExt === 'txt'
          const isChordFile = fileExt === 'cho'
          const isVideoFile = fileExt === 'mp4' || fileExt === 'webm' || fileExt === 'mov'
          const isSelectedText = entry.selected || (isInTexteFolder && isDoc && selectedDoc?.id === entry.doc_id)

          const isSongFolderEntry = entry.folder_type === 'song'

          const folderIcon = entry.type === 'folder' ? (
            entry.folder_type === 'song' && isTexteMode ? <FileText size={18} /> :
            entry.folder_type === 'song' ? <Music size={18} /> :
            entry.folder_type ? createElement(getFolderTypeConfig(entry.folder_type).icon, { size: 18 }) :
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
          const fav = isFavorite(entry.path)

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
              {/* Type badge — inline icon (+ extension for files) */}
              {isActive && isPlaying ? (
                <span className="file-type-badge file-type-badge--playing">
                  <div className="playing-bars">
                    <span /><span /><span />
                  </div>
                </span>
              ) : isTexteMode && isSongFolderEntry ? (
                <span className="file-type-badge file-type-badge--texte">
                  <FileText size={16} />
                </span>
              ) : entry.type === 'folder' && entry.folder_type !== 'song' ? (
                <span className={`file-type-badge ${
                  isTexteFolder ? 'file-type-badge--texte' :
                  entry.folder_type === 'audio' ? 'file-type-badge--folder-audio' :
                  entry.folder_type === 'videos' ? 'file-type-badge--folder-videos' :
                  entry.folder_type === 'multitrack' ? 'file-type-badge--folder-multitrack' :
                  'file-type-badge--folder'
                }`}>
                  {folderIcon}
                </span>
              ) : (isFile || isDoc) ? (
                <>
                  {isSelectedText && <Check size={18} className="file-selected-check" />}
                  <span className={`file-type-badge ${
                    parentFolderType === 'multitrack' ? 'file-type-badge--multitrack' :
                    parentFolderType === 'videos' ? 'file-type-badge--videos' :
                    isVideoFile ? 'file-type-badge--videos' :
                    isChordFile ? 'file-type-badge--text file-type-badge--chord' :
                    isTextFile ? 'file-type-badge--text' :
                    'file-type-badge--audio'
                  }`}>
                    {isChordFile ? <Music size={16} /> : isTextFile ? <FileText size={16} /> : isVideoFile ? <Video size={16} /> : <Volume2 size={16} />}
                    <span className="file-type-ext">{isChordFile ? 'Chords' : fileExt}</span>
                  </span>
                </>
              ) : null}
              <div className="file-info">
                <div className="file-name-row">
                  {fav && <Heart size={16} className="fav-heart" fill="currentColor" strokeWidth={0} />}
                  {entry.is_draft && (
                    <span className="draft-badge" title="Entwurf (nur fuer Pro-Mitglieder sichtbar)">
                      <FileEdit size={14} />
                      Entwurf
                    </span>
                  )}
                  <div className={`file-name ${isActive ? 'file-name--active' : ''}`}>
                    {isMediaEntry && entry.song_name
                      ? songName
                      : (isFile || isDoc)
                        ? formatDisplayName(entry.display_name || entry.name)
                        : (entry.display_name || entry.name)}
                  </div>
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
                  const paddedSubs = padPrimarySubFolders(entry.sub_folders, entry.path)
                  const sortedSubs = [...paddedSubs].sort((a, b) => (SUB_ORDER[a.type] ?? 99) - (SUB_ORDER[b.type] ?? 99))
                  const texteSub = sortedSubs.find((sf) => sf.type === 'texte')
                  return (
                    <>
                      {isTexteMode ? (
                        /* Texte-Modus: einfacher Text statt meta-bricks */
                        texteSub && texteSub.count > 0 ? (
                          <div className="file-meta" style={{ color: 'var(--color-texte, #c7d2fe)' }}>
                            {texteSub.count === 1 ? '1 Text' : `${texteSub.count} Texte`}
                          </div>
                        ) : (
                          <div className="file-meta">Keine Texte</div>
                        )
                      ) : (
                        /* Song-Modus: immer Texte/Audio/Videos — leere Typen gedimmt */
                        <div className="meta-bricks">
                          {sortedSubs.map((sf) => {
                            const isEmpty = sf.count === 0
                            return (
                              <button
                                key={sf.type}
                                className={`meta-brick meta-brick--${sf.type}${isEmpty ? ' meta-brick--empty' : ''}`}
                                disabled={isEmpty}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  loadFolder(sf.path, false, { fromSearch: searchOpen && searchQuery.length >= 2 })
                                }}
                              >
                                {createElement(getFolderTypeConfig(sf.type).icon, { size: 16 })}
                                {sf.count}
                              </button>
                            )
                          })}
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
                {isMediaEntry && generalLabels.length > 0 && !isInsideSong && (
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

          return (
            <li key={entry.path} className={`swipe-wrapper ${isRevealed ? 'swipe-revealed' : ''}`}>
              <div
                className={`swipe-content file-item ${isActive ? 'file-item--active' : ''}${isSongSelected ? ' file-item--song-selected' : ''}${isSongFolderEntry && !isTexteMode ? ' file-item--non-clickable' : ''}`}
                data-path={entry.path}
                onClick={() => handleEntryClick(entry)}
                onTouchStart={handleSwipeStart}
                onTouchEnd={(e) => handleSwipeEnd(entry.path, e)}
              >
                {itemContent}
              </div>
              <div className="swipe-actions">
                {!guest && entry.folder_type === 'song' && (
                  <button
                    className="swipe-action-btn swipe-action-fav"
                    onClick={(e) => { e.stopPropagation(); setRevealedPath(null); toggleFav(entry.path, 'folder') }}
                  >
                    <Heart size={18} fill={fav ? 'currentColor' : 'none'} />
                  </button>
                )}
                {isInTexteFolder && isDoc && entry.doc_id && (
                  <button
                    className={`swipe-action-btn swipe-action-select${selectedDoc?.id === entry.doc_id ? ' swipe-action-select--active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setRevealedPath(null); selectDoc(songFolderPath, entry.doc_id!) }}
                  >
                    <Check size={18} />
                  </button>
                )}
                {!guest && (isFile || isDoc || entry.folder_type === 'song') && !isTexteFolder && !isInsideSong && (
                  <button
                    className="swipe-action-btn swipe-action-label"
                    onClick={(e) => { e.stopPropagation(); setRevealedPath(null); setSwipeLabelPath(swipeLabelPath === entry.path ? null : entry.path) }}
                  >
                    <Tag size={18} />
                  </button>
                )}
                {isProMember && !isTexteFolder && (
                  <button
                    className="swipe-action-btn swipe-action-info"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRevealedPath(null)
                      if (entry.folder_type === 'song') {
                        setRenameName(entry.name.replace(/\.song$/i, ''))
                        setRenameExt('.song')
                      } else if (isInTexteFolder && (isFile || isDoc)) {
                        const dotIdx = entry.name.lastIndexOf('.')
                        if (dotIdx > 0) {
                          setRenameName(entry.name.slice(0, dotIdx))
                          setRenameExt(entry.name.slice(dotIdx))
                        } else {
                          setRenameName(entry.name)
                          setRenameExt(null)
                        }
                      } else {
                        setRenameName(entry.name)
                        setRenameExt(null)
                      }
                      setRenameEntry(entry)
                    }}
                  >
                    <Pencil size={18} />
                  </button>
                )}
                {isProMember && !isTexteFolder && (
                  <button
                    className="swipe-action-btn swipe-action-duplicate"
                    title={`${entry.name} duplizieren`}
                    aria-label={`${entry.name} duplizieren`}
                    disabled={duplicatingPath === entry.path}
                    onClick={(e) => { e.stopPropagation(); handleDuplicate(entry) }}
                  >
                    <Copy size={18} />
                  </button>
                )}
                {isProMember && (
                  <button
                    className={`swipe-action-btn swipe-action-draft${entry.is_draft ? ' swipe-action-draft--active' : ''}`}
                    title={entry.is_draft ? 'Entwurf aufheben' : 'Als Entwurf markieren'}
                    onClick={(e) => { e.stopPropagation(); toggleDraft(entry) }}
                  >
                    <FileEdit size={18} />
                  </button>
                )}
                {canDelete && !isTexteFolder && (
                  <button
                    className="swipe-action-btn swipe-action-delete"
                    onClick={(e) => { e.stopPropagation(); setRevealedPath(null); setConfirmEntry(entry) }}
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
          title={confirmEntry.folder_type === 'song' ? 'Song loeschen?' : confirmEntry.type === 'folder' ? 'Ordner loeschen?' : 'Datei loeschen?'}
          filename={confirmEntry.display_name || confirmEntry.name}
          hint={confirmEntry.folder_type === 'song'
            ? 'Der Song wird in den Papierkorb verschoben.'
            : confirmEntry.type === 'folder'
              ? 'Nur leere Ordner koennen geloescht werden.'
              : 'Wird unwiderruflich aus der Dropbox geloescht.'}
          onClose={() => setConfirmEntry(null)}
          confirmLabel={confirmEntry.folder_type === 'song' ? 'In Papierkorb' : 'Loeschen'}
          confirmLoadingLabel={confirmEntry.folder_type === 'song' ? 'Verschieben...' : 'Loeschen...'}
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
          {renameExt && (
            <div className="recording-filename-preview">
              {renameName.trim()}{renameExt}
            </div>
          )}
        </ConfirmDialog>
      )}

      {renameEntry && (renameEntry.type === 'file' || renameEntry.type === 'document') && renameExt !== null && (
        <ConfirmDialog
          title="Datei umbenennen"
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
          <div className="recording-filename-preview">
            {renameName.trim()}{renameExt}
          </div>
        </ConfirmDialog>
      )}

      {renameEntry && (renameEntry.type === 'file' || renameEntry.type === 'document') && renameExt === null && (
        <RenameModal
          path={renameEntry.path}
          currentName={renameEntry.name}
          folderPath={browsePath}
          onClose={() => setRenameEntry(null)}
          onRenamed={() => { setRenameEntry(null); loadFolder(browsePath, true) }}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".mp3,.m4a,.ogg,.opus,.webm,.wav,.mid,.midi,.pdf,.txt,.cho"
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

      {videoEntry && (
        <VideoModal
          path={videoEntry.path}
          name={videoEntry.name}
          onClose={() => setVideoEntry(null)}
        />
      )}

      {importOpen && importedFiles.length > 0 && (() => {
        const isRootUpload = !deriveSongFolderPath(browsePath)
        return (
          <ImportModal
            files={importedFiles}
            targetPath={browsePath}
            isAdmin={isAdmin}
            rootUpload={isRootUpload || undefined}
            onClose={() => { setImportOpen(false); setImportedFiles([]) }}
            onUploadComplete={() => {
              useDocumentsStore.setState({ loadedFolder: null })
              if (isRootUpload) {
                // Root mode: stay in root, reload folder
                loadFolder(browsePath, true)
              } else {
                // Song mode: switch to the tab matching the file type, highlight file
                const songFolder = deriveSongFolderPath(browsePath)
                if (songFolder && importedFiles[0]) {
                  const ext = importedFiles[0].name.split('.').pop()?.toLowerCase() || ''
                  const isDoc = ['pdf', 'txt', 'cho'].includes(ext)
                  const isVideo = ['mp4', 'mov'].includes(ext)
                  const subFolder = isDoc ? 'Texte' : isVideo ? 'Videos' : 'Audio'
                  const tabPath = `${songFolder}/${subFolder}`
                  useBrowseStore.getState().invalidate(tabPath)
                  loadFolder(tabPath, true)
                } else {
                  loadFolder(browsePath, true)
                }
              }
            }}
          />
        )
      })()}

      {uploadChoiceOpen && (
        <UploadChoiceModal
          onClose={() => setUploadChoiceOpen(false)}
          onPasteText={() => setPasteMode('txt')}
          onPasteChord={() => setPasteMode('cho')}
          onPickFile={() => fileInputRef.current?.click()}
        />
      )}

      {pasteMode && (() => {
        const songFolder = deriveSongFolderPath(browsePath)
        const isRootMode = !songFolder
        const parentPath = songFolder ?? (browsePath || '/')
        const defaultTitle = songFolder
          ? stripFolderExtension(songFolder.split('/').filter(Boolean).pop() || '')
          : ''
        return (
          <PasteTextModal
            mode={pasteMode}
            parentPath={parentPath}
            defaultTitle={defaultTitle}
            createSongFolder={isRootMode}
            onClose={() => setPasteMode(null)}
            onSaved={(folderPath) => {
              setPasteMode(null)
              useDocumentsStore.setState({ loadedFolder: null })
              useBrowseStore.getState().invalidate(folderPath)
              // In root mode also invalidate parent so the new .song shows up
              if (isRootMode) useBrowseStore.getState().invalidate(parentPath)
              loadFolder(folderPath, true)
            }}
          />
        )
      })()}
    </div>
  )
}
