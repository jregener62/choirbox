import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import {
  PasswordStrengthMeter,
  evaluatePassword,
  MIN_PASSWORD_LENGTH,
} from '@/components/ui/PasswordStrengthMeter.tsx'

export function RegisterPage() {
  const { inviteCode } = useParams<{ inviteCode: string }>()
  const [choirName, setChoirName] = useState<string | null>(null)
  const [choirError, setChoirError] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
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
      })
      .catch(() => setChoirError('Ungueltiger Einladungslink'))
  }, [inviteCode])

  if (!inviteCode) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">
              <img src="/icons/bird-white.png" alt="" width={28} height={28} />
            </div>
            <h1 className="auth-title">CantaBox</h1>
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
              <img src="/icons/bird-white.png" alt="" width={28} height={28} />
            </div>
            <h1 className="auth-title">CantaBox</h1>
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

  const pwCheck = evaluatePassword(password, [username])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!pwCheck.acceptable) {
      setError(
        pwCheck.tooShort
          ? `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen haben`
          : 'Passwort ist zu schwach'
      )
      return
    }
    if (password !== passwordConfirm) {
      setError('Passwoerter stimmen nicht ueberein')
      return
    }
    setLoading(true)
    try {
      await register({
        invite_code: inviteCode,
        username,
        password,
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
            <img src="/icons/bird-white.png" alt="" width={28} height={28} />
          </div>
          <h1 className="auth-title">CantaBox</h1>
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
                {...({ passwordrules: `minlength: ${MIN_PASSWORD_LENGTH}; required: lower; required: upper; required: digit;` } as Record<string, string>)}
                minLength={MIN_PASSWORD_LENGTH}
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
            <PasswordStrengthMeter password={password} userInputs={[username]} />
          </div>
          <div className="auth-field">
            <label className="auth-label">Passwort wiederholen</label>
            <input
              className="auth-input"
              type={showPw ? 'text' : 'password'}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              {...({ passwordrules: `minlength: ${MIN_PASSWORD_LENGTH}; required: lower; required: upper; required: digit;` } as Record<string, string>)}
              required
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            type="submit"
            disabled={loading || !pwCheck.acceptable || password !== passwordConfirm}
          >
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
