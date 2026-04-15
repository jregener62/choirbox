import { useMemo, useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { api } from '@/api/client.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { Modal } from './Modal'
import {
  PasswordStrengthMeter,
  evaluatePassword,
  MIN_PASSWORD_LENGTH,
} from './PasswordStrengthMeter.tsx'

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message
    if (msg.includes('Current password')) return 'Temporaeres Passwort ist falsch'
    return msg
  }
  return 'Fehler beim Aendern'
}

export function MustChangePasswordScreen() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [oldPw, setOldPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [newPwConfirm, setNewPwConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const pwCheck = useMemo(
    () => evaluatePassword(newPw, [user?.username ?? '', user?.display_name ?? '']),
    [newPw, user?.username, user?.display_name],
  )

  const canSubmit =
    !!oldPw && pwCheck.acceptable && newPw === newPwConfirm && !submitting

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setError('')
    setSubmitting(true)
    try {
      await api('/auth/me/password', {
        method: 'PUT',
        body: { old_password: oldPw, new_password: newPw },
      })
      if (user) {
        const updated = { ...user, must_change_password: false }
        localStorage.setItem('choirbox_user', JSON.stringify(updated))
        useAuthStore.setState({ user: updated })
      }
      setOldPw('')
      setNewPw('')
      setNewPwConfirm('')
    } catch (err) {
      setError(formatError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="Passwort festlegen"
      onClose={() => { /* nicht schliessbar */ }}
      closeOnOverlay={false}
      showClose={false}
    >
      <div style={{
        display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start',
        padding: 'var(--space-3)', marginBottom: 'var(--space-3)',
        background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
      }}>
        <KeyRound size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          Du hast ein temporaeres Passwort erhalten. Lege jetzt dein eigenes Passwort fest,
          um ChoirBox zu nutzen.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Username-Kontext fuer Passwort-Manager (Safari/iOS Passwords):
            ohne dieses Feld weiss der Manager nicht, fuer welchen Account
            das neue Passwort gespeichert werden soll und triggert auch
            keinen Vorschlag fuer ein starkes Passwort. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={user?.username ?? ''}
          readOnly
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
            overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0,
          }}
        />

        <div className="auth-field">
          <label className="auth-label">Temporaeres Passwort</label>
          <input
            className="auth-input"
            type="password"
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
            autoComplete="current-password"
            autoFocus
            required
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">Neues Passwort</label>
          <input
            className="auth-input"
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            autoComplete="new-password"
            {...({ passwordrules: `minlength: ${MIN_PASSWORD_LENGTH}; required: lower; required: upper; required: digit;` } as Record<string, string>)}
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
          <PasswordStrengthMeter
            password={newPw}
            userInputs={[user?.username ?? '', user?.display_name ?? '']}
          />
        </div>

        <div className="auth-field">
          <label className="auth-label">Neues Passwort wiederholen</label>
          <input
            className="auth-input"
            type="password"
            value={newPwConfirm}
            onChange={(e) => setNewPwConfirm(e.target.value)}
            autoComplete="new-password"
            {...({ passwordrules: `minlength: ${MIN_PASSWORD_LENGTH}; required: lower; required: upper; required: digit;` } as Record<string, string>)}
            required
          />
          {newPwConfirm && newPw !== newPwConfirm && (
            <p style={{ margin: 'var(--space-1) 0 0', fontSize: 12, color: 'var(--danger)' }}>
              Passwoerter stimmen nicht ueberein
            </p>
          )}
        </div>

        {error && (
          <div className="auth-error" style={{ marginTop: 'var(--space-2)' }}>{error}</div>
        )}

        <div className="confirm-actions" style={{ marginTop: 'var(--space-3)' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={logout}
            disabled={submitting}
          >
            Abbrechen
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={!canSubmit}
          >
            {submitting ? 'Speichern...' : 'Passwort festlegen'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
