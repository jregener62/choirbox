import { useState, useEffect } from 'react'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import type { Favorite } from '@/types/index.ts'

export function FavoritesPage() {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState(true)

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
          <div className="empty-state-icon">{'\u2764\uFE0F'}</div>
          <div>Noch keine Favoriten</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Markiere Dateien als Favorit beim Abspielen
          </div>
        </div>
      )}

      <ul className="file-list">
        {favorites.map((fav) => (
          <li key={fav.id} className="file-item" onClick={() => handlePlay(fav)}>
            <div className="file-icon">{'\uD83C\uDFB5'}</div>
            <div className="file-info">
              <div className="file-name">{fav.file_name}</div>
              <div className="file-meta">{fav.dropbox_path}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
