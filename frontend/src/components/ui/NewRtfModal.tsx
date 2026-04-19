import { useState } from 'react'
import { FileText, Loader, AlertCircle } from 'lucide-react'
import { Modal } from './Modal'
import { api } from '@/api/client'

interface NewRtfModalProps {
  /** Either an existing .song folder, or its parent (when createSongFolder is true). */
  parentPath: string
  /** Pre-filled value for the title input. Empty in root-upload mode. */
  defaultTitle: string
  /** If true, also create a new <title>.song folder under parentPath. */
  createSongFolder?: boolean
  onClose: () => void
  /** Called with the final Texte-Folder path and the new document's filename. */
  onSaved: (folderPath: string, filename: string) => void
}

/**
 * Legt eine neue (leere) .rtf-Datei im Texte-Ordner eines Songs an und oeffnet
 * sie direkt im RtfEditor. Unterscheidet sich von PasteTextModal dadurch,
 * dass nur der Dateiname abgefragt wird — kein Text-Input, weil der Inhalt
 * gleich im Editor eingegeben wird.
 */
export function NewRtfModal({
  parentPath,
  defaultTitle,
  createSongFolder = false,
  onClose,
  onSaved,
}: NewRtfModalProps) {
  const [title, setTitle] = useState(defaultTitle)
  const [phase, setPhase] = useState<'input' | 'saving' | 'error'>('input')
  const [error, setError] = useState('')

  const canSave = title.trim().length > 0
  const titleLabel = createSongFolder ? 'Songname' : 'Dateiname'

  const handleSave = async () => {
    if (!canSave) return
    setPhase('saving')
    setError('')
    try {
      const trimmedTitle = title.trim()
      const result = await api<{ folder_path: string; original_name: string }>(
        '/documents/paste-text',
        {
          method: 'POST',
          body: {
            folder_path: parentPath,
            title: trimmedTitle,
            text: '',
            file_type: 'rtf',
            ...(createSongFolder ? { song_folder_name: trimmedTitle } : {}),
          },
        },
      )
      onSaved(result.folder_path, result.original_name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen')
      setPhase('error')
    }
  }

  return (
    <Modal
      title="Neuer Rich-Text"
      onClose={onClose}
      closeOnOverlay={phase !== 'saving'}
      showClose={phase !== 'saving'}
    >
      {phase === 'input' && (
        <>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <label
              htmlFor="new-rtf-title"
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
              id="new-rtf-title"
              type="text"
              className="auth-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={titleLabel}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && canSave) handleSave() }}
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

          <p
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              margin: '0 0 var(--space-3)',
            }}
          >
            Die Datei wird leer angelegt — nach dem Speichern oeffnet sich der Editor.
          </p>

          <button
            className="btn btn-primary"
            style={{ gap: 'var(--space-2)', width: '100%' }}
            onClick={handleSave}
            disabled={!canSave}
          >
            <FileText size={18} />
            Anlegen &amp; bearbeiten
          </button>
        </>
      )}

      {phase === 'saving' && (
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <Loader size={24} className="import-icon-uploading" />
          <p style={{ marginTop: 'var(--space-3)', color: 'var(--text-secondary)' }}>
            Wird angelegt…
          </p>
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
