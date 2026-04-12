import { useEffect } from 'react'

import { clearGuestGoodbyeFlag } from '@/stores/authStore.ts'

export function GuestGoodbyePage() {
  useEffect(() => {
    clearGuestGoodbyeFlag()
  }, [])

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <img src="/icons/bird-white.png" alt="" width={28} height={28} />
          </div>
          <h1 className="auth-title">CantaBox</h1>
          <p className="auth-subtitle">Bis zum naechsten Mal!</p>
        </div>

        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Schoen, dass du dabei warst. Dein Gastzugang ist jetzt beendet.
          Wenn du weiter ueben moechtest, frag deinen Chor-Admin nach einem neuen Link.
        </p>
      </div>
    </div>
  )
}
