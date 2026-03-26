import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore.ts'

const VOICE_PARTS = ['Sopran', 'Alt', 'Tenor', 'Bass'] as const

export function RegisterPage() {
  const [code, setCode] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
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
    <div className="login-page">
      <div className="login-title">Registrieren</div>
      <form className="login-form" onSubmit={handleSubmit}>
        {error && <div className="login-error">{error}</div>}
        <input
          className="input"
          type="text"
          placeholder="Registrierungscode"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <input
          className="input"
          type="text"
          placeholder="Anzeigename"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <input
          className="input"
          type="text"
          placeholder="Benutzername"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Passwort wiederholen"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />

        <div className="input-group">
          <div className="input-label">Stimmgruppe</div>
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

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Wird erstellt...' : 'Konto erstellen'}
        </button>
      </form>
      <div className="login-footer">
        Bereits registriert?{' '}
        <a onClick={() => navigate('/login')}>Anmelden</a>
      </div>
    </div>
  )
}
