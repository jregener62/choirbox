import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuthStore } from '@/stores/authStore.ts'

/**
 * Einloese-Seite fuer Gast-Zugaenge: `/guest/:token`.
 *
 * Wird beim Mount einmal ausgefuehrt und schickt den Token ans Backend.
 * Bei Erfolg wird der User ueber den authStore eingeloggt und zu /browse
 * weitergeleitet. Bei Fehler wird eine einheitliche Meldung gezeigt
 * (keine Unterscheidung zwischen invalid/consumed/revoked/expired —
 * so will es der Backend-Endpoint).
 */
export function GuestRedeemPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const redeemGuestLink = useAuthStore((s) => s.redeemGuestLink)

  const [status, setStatus] = useState<'pending' | 'error'>('pending')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('Kein Gast-Code in der URL.')
      return
    }
    let cancelled = false
    redeemGuestLink(token)
      .then(() => {
        if (!cancelled) navigate('/browse', { replace: true })
      })
      .catch((e) => {
        if (cancelled) return
        setStatus('error')
        setError(
          e instanceof Error ? e.message : 'Gast-Link ungueltig oder abgelaufen.',
        )
      })
    return () => {
      cancelled = true
    }
  }, [token, redeemGuestLink, navigate])

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <img src="/icons/bird-white.png" alt="" width={28} height={28} />
          </div>
          <h1 className="auth-title">CantaBox</h1>
          <p className="auth-subtitle">
            {status === 'pending' ? 'Gast-Zugang wird eingeloest…' : 'Gast-Zugang'}
          </p>
        </div>

        {status === 'error' && (
          <>
            <div className="auth-error">{error}</div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 16 }}
              onClick={() => navigate('/login', { replace: true })}
            >
              Zur Anmeldung
            </button>
          </>
        )}
      </div>
    </div>
  )
}
