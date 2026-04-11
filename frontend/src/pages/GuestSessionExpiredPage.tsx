import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { clearGuestExpiredFlag } from '@/stores/authStore.ts'

/**
 * Wird vom AuthGuard angezeigt, wenn eine Gast-Session abgelaufen ist
 * (oder der Server ein 401 liefert, nachdem der User als Gast
 * eingeloggt war). Statt die Login-Seite zu zeigen — die fuer einen
 * Gast ohne Passwort sinnlos ist — bekommt er hier eine klare
 * Erklaerung und einen Hinweis auf den naechsten Schritt.
 */
export function GuestSessionExpiredPage() {
  const navigate = useNavigate()

  useEffect(() => {
    // Flag konsumieren, damit ein normaler Login/Refresh danach wieder
    // auf /login und nicht immer wieder auf /guest-expired fuehrt.
    clearGuestExpiredFlag()
  }, [])

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <img src="/icons/bird-white.png" alt="" width={28} height={28} />
          </div>
          <h1 className="auth-title">CantaBox</h1>
          <p className="auth-subtitle">Gast-Session beendet</p>
        </div>

        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          Deine Gast-Session ist abgelaufen. Gastzugaenge sind zeitlich
          begrenzt — fuer einen neuen Zugang brauchst du einen aktuellen
          Link vom Chor-Admin.
        </p>

        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={() => navigate('/login', { replace: true })}
        >
          Zur Anmeldung
        </button>
      </div>
    </div>
  )
}
