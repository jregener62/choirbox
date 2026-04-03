import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Music, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'

export function RegisterPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>()
  const [choirName, setChoirName] = useState<string | null>(null)
  const [choirError, setChoirError] = useState('')
  const [voiceParts, setVoiceParts] = useState<string[]>([])  // dynamisch vom Server
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

  useEffect(() => {
    if (!inviteCode) return
    fetch(`/api/auth/choir-info?invite_code=${encodeURIComponent(inviteCode)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Ungueltiger Einladungslink')
        return res.json()
      })
      .then((data) => {
        setChoirName(data.choir_name)
        if (data.voice_labels?.length > 0) {
          setVoiceParts(data.voice_labels.map((l: { name: string }) => l.name))
        }
      })
      .catch(() => setChoirError('Ungueltiger Einladungslink'))
  }, [inviteCode])

  if (!inviteCode) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <Music size={24} />
            </div>
            <h1 className="auth-title">Cantabox</h1>
          </div>
          <p style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
            Du brauchst einen Einladungslink von deinem Chorleiter, um ein Konto zu erstellen.
          </p>
          <p className="auth-footer">
            Bereits registriert?{' '}
            <a onClick={() => navigate('/login')}>Anmelden</a>
          </p>
        </div>
      </div>
    )
  }

  if (choirError) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <Music size={24} />
            </div>
            <h1 className="auth-title">Cantabox</h1>
          </div>
          <div className="auth-error">{choirError}</div>
          <p className="auth-footer">
            Bereits registriert?{' '}
            <a onClick={() => navigate('/login')}>Anmelden</a>
          </p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== passwordConfirm) {
      setError('Passwoerter stimmen nicht ueberein')
      return
    }
    if (voiceParts.length > 0 && !voicePart) {
      setError('Bitte Stimmgruppe waehlen')
      return
    }

    setLoading(true)
    try {
      await register({
        invite_code: inviteCode,
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
          {choirName && (
            <p style={{ marginTop: 'var(--space-2)', opacity: 0.8 }}>
              Chor: <strong>{choirName}</strong>
            </p>
          )}
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
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
              {voiceParts.map((part) => (
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

          <button className="btn btn-primary" style={{ width: '100%' }} type="submit" disabled={loading}>
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
