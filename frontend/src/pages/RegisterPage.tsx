import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'

const VOICE_PARTS = ['Sopran', 'Alt', 'Tenor', 'Bass'] as const

export function RegisterPage() {
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [voicePart, setVoicePart] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const register = useAuthStore((s) => s.register)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== passwordConfirm) {
      setError('Passwoerter stimmen nicht ueberein')
      return
    }
    if (!voicePart) {
      setError('Bitte Stimmgruppe waehlen')
      return
    }

    setLoading(true)
    try {
      await register({
        registration_code: code,
        username,
        display_name: displayName || username,
        password,
        voice_part: voicePart,
      })
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-icon">
            <Music size={24} />
          </div>
          <h1 className="auth-title">Cantabox</h1>
          <p className="auth-subtitle">Konto erstellen</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label">Registrierungscode</label>
            <input
              className="auth-input"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Vom Chorleiter erhalten"
              required
            />
          </div>
          <div className="auth-field">
            <label className="auth-label">Anzeigename</label>
            <input
              className="auth-input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="auth-field">
            <label className="auth-label">Benutzername</label>
            <input
              className="auth-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
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
                autoComplete="new-password"
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
          <div className="auth-field">
            <label className="auth-label">Passwort wiederholen</label>
            <input
              className="auth-input"
              type={showPw ? 'text' : 'password'}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label">Stimmgruppe</label>
            <div className="voice-part-selector">
              {VOICE_PARTS.map((part) => (
                <button
                  key={part}
                  type="button"
                  className={`voice-part-btn ${voicePart === part ? 'selected' : ''}`}
                  onClick={() => setVoicePart(part)}
                >
                  {part}
                </button>
              ))}
            </div>
          </div>

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Wird erstellt...' : 'Konto erstellen'}
          </button>
        </form>

        <p className="auth-footer">
          Bereits registriert?{' '}
          <a onClick={() => navigate('/login')}>Anmelden</a>
        </p>
      </div>
    </div>
  )
}
