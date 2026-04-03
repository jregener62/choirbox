import { useEffect, useState } from 'react'
import { Heart, Trash2, ChevronLeft, Folder } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { parseTrackFilename } from '@/utils/parseTrackFilename'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useFavoritesStore } from '@/hooks/useFavorites.ts'
import { useAppStore } from '@/stores/appStore.ts'
import { useLabelsStore } from '@/hooks/useLabels.ts'
import { useSectionPresetsStore } from '@/hooks/useSectionPresets.ts'
import { formatDisplayName } from '@/utils/formatters.ts'
import SkeletonList from '@/components/ui/SkeletonList'
import type { Favorite } from '@/types/index.ts'

interface FolderGroup {
  folder: Favorite
  files: Favorite[]
}

function groupFavorites(favorites: Favorite[]): { groups: FolderGroup[]; ungrouped: Favorite[] } {
  const folders = favorites.filter((f) => f.entry_type === 'folder')
  const files = favorites.filter((f) => f.entry_type !== 'folder')

  const groups: FolderGroup[] = folders.map((folder) => ({
    folder,
    files: files.filter((f) => f.dropbox_path.startsWith(folder.dropbox_path + '/')),
  }))

  const groupedPaths = new Set(groups.flatMap((g) => g.files.map((f) => f.dropbox_path)))
  const ungrouped = files.filter((f) => !groupedPaths.has(f.dropbox_path))

  return { groups, ungrouped }
}

export function FavoritesPage() {
  const navigate = useNavigate()
  const { favorites, loaded, load, toggle } = useFavoritesStore()
  const { labels, assignments, loaded: labelsLoaded, load: loadLabels, getLabelsForPath } = useLabelsStore()
  const currentPath = usePlayerStore((s) => s.currentPath)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const [activeFilters, setActiveFilters] = useState<number[]>([])

  const voiceLabelsAll = useLabelsStore((s) => s.voiceLabels)()
  const voiceShortcodes = voiceLabelsAll.filter((l) => l.shortcode).map((l) => l.shortcode!)
  const voiceLookup = Object.fromEntries(voiceLabelsAll.filter((l) => l.shortcode).map((l) => [l.shortcode!, { name: l.name, color: l.color }]))
  const sectionPresets = useSectionPresetsStore((s) => s.presets)
  const sectionPresetsLoaded = useSectionPresetsStore((s) => s.loaded)
  const loadSectionPresets = useSectionPresetsStore((s) => s.load)
  const sectionShortcodes = sectionPresets.filter((p) => p.shortcode).map((p) => p.shortcode!)

  useEffect(() => {
    if (!loaded) load()
    if (!labelsLoaded) loadLabels()
    if (!sectionPresetsLoaded) loadSectionPresets()
  }, [loaded, load, labelsLoaded, loadLabels, sectionPresetsLoaded, loadSectionPresets])

  const handlePlay = (dropboxPath: string, fileName: string) => {
    if (dropboxPath !== currentPath) {
      usePlayerStore.getState().setTrack(dropboxPath, fileName)
    }
    navigate('/player')
  }

  const toggleFilter = (labelId: number) => {
    setActiveFilters((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId]
    )
  }

  // Filter favorites by active labels (only applies to files)
  const filteredFavs = activeFilters.length === 0
    ? favorites
    : favorites.filter((fav) => {
        if (fav.entry_type === 'folder') return true
        const trackLabels = getLabelsForPath(fav.dropbox_path)
        return trackLabels.some((l) => activeFilters.includes(l.id))
      })

  const { groups, ungrouped } = groupFavorites(filteredFavs)
  const totalCount = filteredFavs.length

  // Show filter bar if any favorites have labels
  const hasLabels = assignments.some((a) =>
    favorites.some((f) => f.dropbox_path === a.dropbox_path)
  )

  const renderFileItem = (fav: Favorite) => {
    const isActive = fav.dropbox_path === currentPath
    const trackLabels = getLabelsForPath(fav.dropbox_path)
    const favFolderName = fav.dropbox_path.split('/').filter(Boolean).slice(-2, -1)[0] || ''
    const parsed = parseTrackFilename(fav.file_name, favFolderName, voiceShortcodes, sectionShortcodes)
    const voiceTags = parsed
      ? parsed.voices
          .map((v) => {
            const info = voiceLookup[v]
            return { letter: v, name: info?.name || v, color: info?.color || 'var(--accent)' }
          })
          .sort((a, b) => a.name.localeCompare(b.name))
      : []
    const sections = parsed && parsed.sectionKey !== 'Gesamt'
      ? parsed.sections.map((s) => s.replace(/(\d)/, ' $1'))
      : []
    return (
      <li
        key={fav.id}
        className={`file-item fav-file-indented ${isActive ? 'file-item--active' : ''}`}
        onClick={() => handlePlay(fav.dropbox_path, fav.file_name)}
      >
        {isActive && isPlaying ? (
          <div className="file-icon-box file-icon-playing">
            <div className="playing-bars"><span /><span /><span /></div>
          </div>
        ) : null}
        <div className="file-info">
          <div className={`file-name ${isActive ? 'file-name--active' : ''}`}>
            {formatDisplayName(fav.file_name)}
          </div>
          {voiceTags.length > 0 && (
            <div className="meta-line1">
              {voiceTags.map((v) => (
                <span key={v.letter} className="meta-voice-tag" style={{ color: v.color }}>
                  <span className="meta-voice-dot" style={{ background: v.color }} />
                  {v.name}
                </span>
              ))}
            </div>
          )}
          {sections.length > 0 && (
            <div className="meta-line2">
              {sections.map((s) => (
                <span key={s} className="meta-section">{s}</span>
              ))}
            </div>
          )}
          {trackLabels.length > 0 && (
            <div className="meta-line3">
              {trackLabels.map((l) => (
                <span key={l.id} className="meta-label" style={{ color: l.color }}>
                  {l.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          className="fav-toggle"
          onClick={(e) => { e.stopPropagation(); toggle(fav.dropbox_path) }}
        >
          <Trash2 size={16} color="var(--text-muted)" />
        </button>
      </li>
    )
  }

  return (
    <div>
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate('/')}>
          <ChevronLeft size={22} />
        </button>
        <div className="topbar-title">Favoriten</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '0 8px' }}>
          {loaded ? totalCount : ''}
        </div>
      </div>

      {/* Label filter */}
      {hasLabels && labels.length > 0 && (
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

      {!loaded && <SkeletonList />}

      {loaded && favorites.length === 0 && (
        <div className="empty-state">
          <Heart size={48} strokeWidth={1} style={{ opacity: 0.3 }} />
          <div>Noch keine Favoriten</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Markiere Dateien oder Ordner mit dem Herz-Symbol
          </div>
        </div>
      )}

      {loaded && favorites.length > 0 && filteredFavs.length === 0 && (
        <div className="empty-state">
          <div>Keine Favoriten mit diesem Label</div>
        </div>
      )}

      <ul className="file-list">
        {/* Folder groups */}
        {groups.map((group) => (
          <li key={group.folder.id} className="fav-folder-group">
            <div
              className="fav-folder-divider"
              onClick={() => {
                useAppStore.getState().setBrowsePath(group.folder.dropbox_path)
                useAppStore.getState().setBrowseReturnTo('/favorites')
                navigate('/')
              }}
            >
              <div className="fav-folder-divider-icon">
                <Folder size={18} />
              </div>
              <span className="fav-folder-divider-name">{group.folder.file_name}</span>
              {group.files.length > 0 && (
                <span className="fav-folder-divider-count">
                  {group.files.length} {group.files.length === 1 ? 'Datei' : 'Dateien'}
                </span>
              )}
              <button
                className="fav-toggle"
                onClick={(e) => { e.stopPropagation(); toggle(group.folder.dropbox_path, 'folder') }}
              >
                <Trash2 size={16} color="var(--text-muted)" />
              </button>
            </div>
            <ul className="file-list">
              {group.files.map(renderFileItem)}
            </ul>
          </li>
        ))}

        {/* Ungrouped files */}
        {ungrouped.length > 0 && groups.length > 0 && (
          <li className="fav-section-label">Einzelne Dateien</li>
        )}
        {ungrouped.map((fav) => {
          const isActive = fav.dropbox_path === currentPath
          const trackLabels = getLabelsForPath(fav.dropbox_path)
          const favFolderName = fav.dropbox_path.split('/').filter(Boolean).slice(-2, -1)[0] || ''
          const parsed = parseTrackFilename(fav.file_name, favFolderName)
          const voiceTags = parsed
            ? parsed.voices
                .map((v) => ({ letter: v, name: voiceFullName(v), color: voiceColor(v) }))
                .sort((a, b) => a.name.localeCompare(b.name))
            : []
          const sections = parsed && parsed.sectionKey !== 'Gesamt'
            ? parsed.sections.map((s) => s.replace(/(\d)/, ' $1'))
            : []
          return (
            <li
              key={fav.id}
              className={`file-item ${isActive ? 'file-item--active' : ''}`}
              onClick={() => handlePlay(fav.dropbox_path, fav.file_name)}
            >
              {isActive && isPlaying ? (
                <div className="file-icon-box file-icon-playing">
                  <div className="playing-bars"><span /><span /><span /></div>
                </div>
              ) : null}
              <div className="file-info">
                <div className={`file-name ${isActive ? 'file-name--active' : ''}`}>
                  {formatDisplayName(fav.file_name)}
                </div>
                {voiceTags.length > 0 && (
                  <div className="meta-line1">
                    {voiceTags.map((v) => (
                      <span key={v.letter} className="meta-voice-tag" style={{ color: v.color }}>
                        <span className="meta-voice-dot" style={{ background: v.color }} />
                        {v.name}
                      </span>
                    ))}
                  </div>
                )}
                {sections.length > 0 && (
                  <div className="meta-line2">
                    {sections.map((s) => (
                      <span key={s} className="meta-section">{s}</span>
                    ))}
                  </div>
                )}
                {trackLabels.length > 0 && (
                  <div className="meta-line3">
                    {trackLabels.map((l) => (
                      <span key={l.id} className="meta-label" style={{ color: l.color }}>
                        {l.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="fav-toggle"
                onClick={(e) => { e.stopPropagation(); toggle(fav.dropbox_path) }}
              >
                <Trash2 size={16} color="var(--text-muted)" />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
