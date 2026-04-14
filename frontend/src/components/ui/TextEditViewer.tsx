import { useEffect, useState } from 'react'
import { Save, X, Eye } from 'lucide-react'
import { api } from '@/api/client'
import { useChordInput } from '@/hooks/useChordInput'
import './TextEditViewer.css'

interface TextEditViewerProps {
  docId: number
  fileType: 'txt' | 'cho'
  initialContent: string
  onSaved: () => void
  onCancel: () => void
}

export function TextEditViewer({
  docId,
  fileType,
  initialContent,
  onSaved,
  onCancel,
}: TextEditViewerProps) {
  const [content, setContent] = useState(initialContent)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    setContent(initialContent)
  }, [initialContent])

  const setEditorMode = useChordInput((s) => s.setMode)
  useEffect(() => {
    setEditorMode(true)
    return () => setEditorMode(false)
  }, [setEditorMode])

  const dirty = content !== initialContent

  const doSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await api(`/documents/${docId}/content`, {
        method: 'PUT',
        body: { content },
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
      setConfirmOverwrite(false)
    }
  }

  const handleClose = () => {
    if (dirty) {
      if (window.confirm('Aenderungen verwerfen?')) onCancel()
    } else {
      onCancel()
    }
  }

  const statusLabel =
    fileType === 'cho'
      ? 'Text-Modus · ChordPro-Quelle direkt bearbeiten'
      : 'Text-Modus · Liedtext bearbeiten'

  return (
    <div className="text-edit-viewer">
      <div className="text-edit-toolbar">
        <div className="text-edit-toolbar-top">
          <div className="text-edit-status">{statusLabel}</div>
          <button
            type="button"
            className="text-edit-close"
            onClick={handleClose}
            aria-label="Schliessen"
            title="Schliessen"
          >
            <X size={18} />
          </button>
        </div>
        <div className="text-edit-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary text-edit-action"
            onClick={() => setPreview((p) => !p)}
          >
            <Eye size={16} />
            {preview ? 'Bearbeiten' : 'Vorschau'}
          </button>
          <button
            type="button"
            className="btn btn-primary text-edit-action"
            onClick={() => setConfirmOverwrite(true)}
            disabled={saving || !dirty}
          >
            <Save size={16} />
            {saving ? 'Speichern...' : 'Speichern'}
          </button>
        </div>
      </div>

      {error && <div className="text-edit-error">{error}</div>}

      {preview ? (
        <pre className="text-edit-preview">{content}</pre>
      ) : (
        <textarea
          className="text-edit-area"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          autoFocus
        />
      )}

      {confirmOverwrite && (
        <div
          className="text-edit-overlay"
          onClick={() => !saving && setConfirmOverwrite(false)}
        >
          <div
            className="text-edit-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-edit-dialog-header">
              Aenderungen speichern?
            </div>
            <div className="text-edit-dialog-body">
              Der aktuelle Inhalt der Datei wird mit deinen Aenderungen
              ueberschrieben.
            </div>
            <div className="text-edit-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setConfirmOverwrite(false)}
                disabled={saving}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={doSave}
                disabled={saving}
              >
                {saving ? 'Speichern...' : 'Ueberschreiben'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
