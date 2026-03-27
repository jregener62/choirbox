import { useEffect, useState } from 'react'
import { Heart, Trash2 } from 'lucide-react'
import { VoiceIcon } from '@/components/ui/VoiceIcon'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useFavoritesStore } from '@/hooks/useFavorites.ts'
import { useLabelsStore } from '@/hooks/useLabels.ts'

export function FavoritesPage() {
  const { favorites, loaded, load, toggle } = useFavoritesStore()
  const { labels, assignments, loaded: labelsLoaded, load: loadLabels, getLabelsForPath } = useLabelsStore()
  const currentPath = usePlayerStore((s) => s.currentPath)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const [activeFilters, setActiveFilters] = useState<number[]>([])

  useEffect(() => {
    if (!loaded) load()
    if (!labelsLoaded) loadLabels()
  }, [loaded, load, labelsLoaded, loadLabels])

  const handlePlay = (dropboxPath: string, fileName: string) => {
    usePlayerStore.getState().setTrack(dropboxPath, fileName)
    usePlayerStore.getState().setPlaying(true)
  }

  const toggleFilter = (labelId: number) => {
    setActiveFilters((prev) =>
      prev.includes(labelId) ? prev.filter((id) => id !== labelId) : [...prev, labelId]
    )
  }

  // Filter favorites by active labels
  const filteredFavs = activeFilters.length === 0
    ? favorites
    : favorites.filter((fav) => {
        const trackLabels = getLabelsForPath(fav.dropbox_path)
        return trackLabels.some((l) => activeFilters.includes(l.id))
      })

  // Show filter bar if any favorites have labels
  const hasLabels = assignments.some((a) =>
    favorites.some((f) => f.dropbox_path === a.dropbox_path)
  )

  return (
    <div>
      <div className="topbar">
        <div className="topbar-title">Favoriten</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '0 8px' }}>
          {loaded ? filteredFavs.length : ''}
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

      {!loaded && <div className="empty-state">Laden...</div>}

      {loaded && favorites.length === 0 && (
        <div className="empty-state">
          <Heart size={48} strokeWidth={1} style={{ opacity: 0.3 }} />
          <div>Noch keine Favoriten</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Markiere Dateien mit dem Herz-Symbol
          </div>
        </div>
      )}

      {loaded && favorites.length > 0 && filteredFavs.length === 0 && (
        <div className="empty-state">
          <div>Keine Favoriten mit diesem Label</div>
        </div>
      )}

      <ul className="file-list">
        {filteredFavs.map((fav) => {
          const isActive = fav.dropbox_path === currentPath
          const trackLabels = getLabelsForPath(fav.dropbox_path)
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
              ) : (
                <VoiceIcon
                  filename={fav.file_name}
                  folderName={fav.dropbox_path.split('/').filter(Boolean).slice(-2, -1)[0] || ''}
                />
              )}
              <div className="file-info">
                <div className={`file-name ${isActive ? 'file-name--active' : ''}`}>
                  {fav.file_name}
                </div>
                {trackLabels.length > 0 && (
                  <div className="file-labels">
                    {trackLabels.map((l) => (
                      <span key={l.id} className="label-chip-sm" style={{ background: l.color + '25', color: l.color }}>
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
