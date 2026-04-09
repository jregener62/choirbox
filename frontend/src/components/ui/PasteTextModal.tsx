import { useState } from 'react'
import { ClipboardPaste, Music, Loader, Check, AlertCircle } from 'lucide-react'
import { Modal } from './Modal'
import { api } from '@/api/client'
import { ensureChordPro } from '@/utils/chordPro'

type Mode = 'txt' | 'cho'

interface PasteTextModalProps {
  mode: Mode
  /** Either an existing .song folder, or its parent (when createSongFolder is true). */
  parentPath: string
  /** Pre-filled value for the title input. Empty in root-upload mode. */
  defaultTitle: string
  /**
   * If true, the title also becomes the new <title>.song folder name.
   * Used when invoking the modal outside of any .song folder.
   */
  createSongFolder?: boolean
  onClose: () => void
  onSaved: (folderPath: string) => void
}

const COPY = {
  txt: {
    title: 'Text einfuegen',
    label: 'Songtext einfuegen',
    placeholder: 'Songtext hier einfuegen…',
    button: 'Text speichern',
    icon: ClipboardPaste,
    hint: 'Tipp: Den Songtext kopieren und hier einfuegen.',
  },
  cho: {
    title: 'Chordsheet einfuegen',
    label: 'Akkorde & Text einfuegen',
    placeholder:
      '[Verse 1]\n    Am              C\nEin Hotdog unten am Hafen\n    E                F\nVorm Einschlafen schnell noch ein Bier',
    button: 'Chordsheet speichern',
    icon: Music,
    hint: 'Tipp: Auf Ultimate Guitar den Text mit Akkorden kopieren und hier einfuegen.',
  },
} as const

export function PasteTextModal({
  mode,
  parentPath,
  defaultTitle,
  createSongFolder = false,
  onClose,
  onSaved,
}: PasteTextModalProps) {
  const [title, setTitle] = useState(defaultTitle)
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<'input' | 'saving' | 'done' | 'error'>('input')
  const [error, setError] = useState('')

  const copy = COPY[mode]
  const Icon = copy.icon
  const canSave = title.trim().length > 0 && text.trim().length > 0

  const titleLabel = createSongFolder ? 'Songname' : 'Titel'

  const handleSave = async () => {
    if (!canSave) return
    setPhase('saving')
    setError('')
    try {
      // For chord sheets: ensure ChordPro format on disk. Auto-detects whether
      // the pasted text is already ChordPro or "chord-line above lyrics" plain
      // text and converts the latter on the fly.
      const trimmedTitle = title.trim()
      const payloadText = mode === 'cho' ? ensureChordPro(text, trimmedTitle) : text
      const result = await api<{ folder_path: string }>('/documents/paste-text', {
        method: 'POST',
        body: {
          folder_path: parentPath,
          title: trimmedTitle,
          text: payloadText,
          file_type: mode,
          ...(createSongFolder ? { song_folder_name: trimmedTitle } : {}),
        },
      })
      setPhase('done')
      onSaved(result.folder_path)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
      setPhase('error')
    }
  }

  return (
    <Modal
      title={copy.title}
      onClose={onClose}
      closeOnOverlay={phase !== 'saving'}
      showClose={phase !== 'saving'}
    >
      {phase === 'input' && (
        <>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label
              htmlFor="paste-title"
              style={{
                display: 'block',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-1)',
              }}
            >
              {titleLabel}
            </label>
            <input
              id="paste-title"
              type="text"
              className="auth-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={titleLabel}
              autoFocus={createSongFolder}
            />
            {createSongFolder && title.trim() && (
              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  marginTop: 'var(--space-1)',
                }}
              >
                Es wird ein neuer Song-Ordner <strong>{title.trim()}.song</strong> angelegt.
              </div>
            )}
          </div>

          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label
              htmlFor="paste-text"
              style={{
                display: 'block',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-1)',
              }}
            >
              {copy.label}
            </label>
            <textarea
              id="paste-text"
              className="auth-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={copy.placeholder}
              rows={12}
              style={{
                fontFamily: mode === 'cho' ? 'monospace' : 'inherit',
                fontSize: 'var(--text-xs)',
                resize: 'vertical',
                lineHeight: 1.4,
                whiteSpace: 'pre',
                overflowWrap: 'normal',
                overflowX: 'auto',
              }}
            />
          </div>

          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              margin: '0 0 var(--space-3)',
            }}
          >
            {copy.hint}
          </p>

          <button
            className="btn btn-primary"
            style={{ gap: 'var(--space-2)', width: '100%' }}
            onClick={handleSave}
            disabled={!canSave}
          >
            <Icon size={18} />
            {copy.button}
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
          <p style={{ marginTop: 'var(--space-3)' }}>Gespeichert!</p>
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
          <p style={{ marginTop: 'var(--space-3)', color: 'var(--danger)' }}>{error}</p>
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
