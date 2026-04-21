import { Check, Undo2, Trash2, Eye, X } from 'lucide-react'
import { useEditorCommands } from '@/hooks/useEditorCommands'

/** Utility actions (Undo / Clear / Preview / Save / Close) fuer die
 *  File-Info-Bar, waehrend der Sheet-Editor oder RTF-Editor aktiv ist.
 *  Liest allen State aus useEditorCommands; kein eigenes Prop-Interface,
 *  damit beliebige Editoren die gleichen Commands wiederverwenden koennen. */
export function EditorActionsInline() {
  const active = useEditorCommands((s) => s.active)
  const sourceMode = useEditorCommands((s) => s.sourceMode)
  const undoDisabled = useEditorCommands((s) => s.undoDisabled)
  const clearDisabled = useEditorCommands((s) => s.clearDisabled)
  const clearTitle = useEditorCommands((s) => s.clearTitle)
  const previewDisabled = useEditorCommands((s) => s.previewDisabled)
  const saving = useEditorCommands((s) => s.saving)
  const saveDisabled = useEditorCommands((s) => s.saveDisabled)
  const saveTitle = useEditorCommands((s) => s.saveTitle)
  const onUndo = useEditorCommands((s) => s.onUndo)
  const onClear = useEditorCommands((s) => s.onClear)
  const onPreview = useEditorCommands((s) => s.onPreview)
  const onSave = useEditorCommands((s) => s.onSave)
  const onClose = useEditorCommands((s) => s.onClose)

  if (!active) return null
  return (
    <div className="pdf-toolbar-actions">
      {!sourceMode && (
        <>
          <button
            type="button"
            className="pdf-toolbar-btn"
            onClick={onUndo}
            disabled={undoDisabled}
            title="Rückgängig"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="pdf-toolbar-btn pdf-toolbar-btn--danger"
            onClick={onClear}
            disabled={clearDisabled}
            title={clearTitle}
          >
            <Trash2 size={16} />
          </button>
        </>
      )}
      <button
        type="button"
        className="pdf-toolbar-btn"
        onClick={onPreview}
        disabled={previewDisabled}
        title="ChordPro-Vorschau"
      >
        <Eye size={16} />
      </button>
      <button
        type="button"
        className="pdf-toolbar-btn"
        onClick={onClose}
        title="Bearbeitung abbrechen"
      >
        <X size={16} />
      </button>
      <button
        type="button"
        className="pdf-toolbar-btn pdf-toolbar-btn--save"
        onClick={onSave}
        disabled={saveDisabled}
        title={saveTitle}
        aria-busy={saving}
      >
        <Check size={16} />
      </button>
    </div>
  )
}
