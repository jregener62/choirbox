import { useEffect } from 'react'
import { Heart, Music, Trash2 } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useFavoritesStore } from '@/hooks/useFavorites.ts'

export function FavoritesPage() {
  const { favorites, loaded, load, toggle } = useFavoritesStore()
  const currentPath = usePlayerStore((s) => s.currentPath)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  useEffect(() => {
    if (!loaded) load()
  }, [loaded, load])

  const handlePlay = (dropboxPath: string, fileName: string) => {
    usePlayerStore.getState().setTrack(dropboxPath, fileName)
    usePlayerStore.getState().setPlaying(true)
  }

  return (
    <div>
      <div className="topbar">
        <div className="topbar-title">Favoriten</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '0 8px' }}>
          {loaded ? favorites.length : ''}
        </div>
      </div>

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

      <ul className="file-list">
        {favorites.map((fav) => {
          const isActive = fav.dropbox_path === currentPath
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
                <div className="file-icon-box file-icon-audio">
                  <Music size={18} />
                </div>
              )}
              <div className="file-info">
                <div className={`file-name ${isActive ? 'file-name--active' : ''}`}>
                  {fav.file_name}
                </div>
                <div className="file-meta">{fav.dropbox_path}</div>
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
