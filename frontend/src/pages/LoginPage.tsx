import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import { Modal } from '@/components/ui/Modal.tsx'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForgotInfo, setShowForgotInfo] = useState(false)
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <img src="/icons/bird-white.png" alt="" width={28} height={28} />
          </div>
          <h1 className="auth-title">CantaBox</h1>
          <p className="auth-subtitle">Anmelden</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label">Benutzername</label>
            <input
              className="auth-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div className="auth-field">
            <label className="auth-label">Passwort</label>
            <div className="auth-input-wrap">
              <input
                className="auth-input"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="auth-pw-toggle"
                onClick={() => setShowPw(!showPw)}
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} type="submit" disabled={loading}>
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>

        <p className="auth-footer" style={{ marginTop: 'var(--space-3)' }}>
          <button
            type="button"
            onClick={() => setShowForgotInfo(true)}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: 'var(--accent)', cursor: 'pointer',
              textDecoration: 'underline', fontFamily: 'inherit', fontSize: 'inherit',
            }}
          >
            Passwort vergessen?
          </button>
        </p>

        <p className="auth-footer">
          Noch kein Konto? Du brauchst einen Einladungslink von deinem Chorleiter.
        </p>

        <p className="auth-footer auth-legal">
          <a href="/impressum" target="_blank" rel="noopener noreferrer">Impressum</a>
          {' · '}
          <a href="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</a>
        </p>
      </div>

      {showForgotInfo && (
        <Modal title="Passwort vergessen" onClose={() => setShowForgotInfo(false)}>
          <p style={{ marginTop: 0 }}>
            ChoirBox speichert bewusst keine E-Mail-Adressen. Deshalb gibt es keinen
            automatischen Reset per E-Mail.
          </p>
          <p>
            <strong>So kommst du wieder rein:</strong>
          </p>
          <ol style={{ paddingLeft: 'var(--space-5)', lineHeight: 1.6 }}>
            <li>Wende dich an deinen Chorleiter oder Admin.</li>
            <li>Er setzt dein Passwort zurueck und uebergibt dir ein neues, einmaliges Passwort.</li>
            <li>Melde dich damit an — du wirst direkt aufgefordert, ein eigenes Passwort zu setzen.</li>
          </ol>
          <div className="confirm-actions" style={{ marginTop: 'var(--space-3)' }}>
            <button className="btn btn-primary" onClick={() => setShowForgotInfo(false)}>
              Verstanden
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
