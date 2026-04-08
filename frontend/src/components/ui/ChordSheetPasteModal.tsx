import { useState } from 'react'
import { Music, Loader, Check, AlertCircle } from 'lucide-react'
import { Modal } from './Modal'
import { importFromText } from '@/api/chordSheets'

interface ChordSheetPasteModalProps {
  songFolder: string
  songName: string
  onClose: () => void
  onSaved: () => void
}

export function ChordSheetPasteModal({
  songFolder,
  songName,
  onClose,
  onSaved,
}: ChordSheetPasteModalProps) {
  const [title, setTitle] = useState(songName)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<'input' | 'saving' | 'done' | 'error'>('input')
  const [error, setError] = useState('')

  const canSave = title.trim().length > 0 && text.trim().length > 0

  const handleSave = async () => {
    if (!canSave) return
    setPhase('saving')
    setError('')

    try {
      await importFromText({
        folder: songFolder,
        title: title.trim(),
        text: text.trim(),
      })
      setPhase('done')
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
      setPhase('error')
    }
  }

  return (
    <Modal
      title="Akkordblatt einfügen"
      onClose={onClose}
      closeOnOverlay={phase !== 'saving'}
      showClose={phase !== 'saving'}
    >
      {phase === 'input' && (
        <>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label
              htmlFor="chord-title"
              style={{
                display: 'block',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-1)',
              }}
            >
              Titel
            </label>
            <input
              id="chord-title"
              type="text"
              className="auth-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Songtitel"
            />
          </div>

          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label
              htmlFor="chord-text"
              style={{
                display: 'block',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-1)',
              }}
            >
              Akkorde & Text einfügen
            </label>
            <textarea
              id="chord-text"
              className="auth-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'[Verse 1]\n    Am              C\nEin Hotdog unten am Hafen\n    E                F\nVorm Einschlafen schnell noch ein Bier'}
              rows={12}
              style={{
                fontFamily: 'monospace',
                fontSize: 'var(--text-xs)',
                resize: 'vertical',
                lineHeight: 1.4,
                whiteSpace: 'pre',
                overflowWrap: 'normal',
                overflowX: 'auto',
              }}
            />
          </div>

          <p style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            margin: `0 0 var(--space-3)`,
          }}>
            Tipp: Auf Ultimate Guitar den Text mit Akkorden kopieren und hier einfügen.
          </p>

          <button
            className="btn btn-primary"
            style={{ gap: 'var(--space-2)', width: '100%' }}
            onClick={handleSave}
            disabled={!canSave}
          >
            <Music size={18} />
            Akkordblatt speichern
          </button>
        </>
      )}

      {phase === 'saving' && (
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <Loader size={24} className="import-icon-uploading" />
          <p style={{ marginTop: 'var(--space-3)', color: 'var(--text-secondary)' }}>
            Wird gespeichert…
          </p>
        </div>
      )}

      {phase === 'done' && (
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <Check size={24} style={{ color: 'var(--success)' }} />
          <p style={{ marginTop: 'var(--space-3)' }}>
            Akkordblatt gespeichert!
          </p>
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 'var(--space-4)' }}
            onClick={onClose}
          >
            Schliessen
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <AlertCircle size={24} style={{ color: 'var(--danger)' }} />
          <p style={{ marginTop: 'var(--space-3)', color: 'var(--danger)' }}>
            {error}
          </p>
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 'var(--space-4)' }}
            onClick={() => setPhase('input')}
          >
            Nochmal versuchen
          </button>
        </div>
      )}
    </Modal>
  )
}
