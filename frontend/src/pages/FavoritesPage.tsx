import { useState, useEffect } from 'react'
import { Heart, Music } from 'lucide-react'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import type { Favorite } from '@/types/index.ts'

export function FavoritesPage() {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)
  const currentPath = usePlayerStore((s) => s.currentPath)
  const isPlaying = usePlayerStore((s) => s.isPlaying)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api<Favorite[]>('/favorites')
        setFavorites(data)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handlePlay = (fav: Favorite) => {
    usePlayerStore.getState().setTrack(fav.dropbox_path, fav.file_name)
    usePlayerStore.getState().setPlaying(true)
  }

  return (
    <div>
      <div className="topbar">
        <div className="topbar-title">Favoriten</div>
      </div>

      {loading && <div className="empty-state">Laden...</div>}

      {!loading && favorites.length === 0 && (
        <div className="empty-state">
          <Heart size={48} strokeWidth={1} style={{ opacity: 0.3 }} />
          <div>Noch keine Favoriten</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Markiere Dateien als Favorit beim Abspielen
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
              onClick={() => handlePlay(fav)}
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
            </li>
          )
        })}
      </ul>
    </div>
  )
}
