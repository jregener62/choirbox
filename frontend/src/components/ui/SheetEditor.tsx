import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '@/api/client.ts'
import { useChordInput } from '@/hooks/useChordInput'
import { useEditorCommands } from '@/hooks/useEditorCommands'
import { isValidChord } from '@/utils/chordValidation'
import { insertAtOffset, wrapLinesAsSection, type SectionType } from '@/utils/chordProEdit'
import { SheetEditToolbar, type ActiveTool } from './SheetEditToolbar'
import { SyntaxTextarea } from './SyntaxTextarea'
import './SheetEditor.css'

interface SheetEditorProps {
  /** Plain source (.txt) — used when creating a new sheet from plain text. */
  text?: string
  /** Existing ChordPro body (.cho) — used when editing in place. */
  chordProBody?: string
  /** When set, Save overwrites this document via PUT /content. */
  editDocId?: number
  onCreated?: (cho: string) => void | Promise<void>
  onUpdated?: () => void
  onCancel?: () => void
}

const SECTION_TOOLS: ActiveTool[] = ['verse', 'chorus', 'bridge', 'intro', 'interlude', 'outro']

function isSection(tool: ActiveTool): tool is SectionType {
  return SECTION_TOOLS.includes(tool)
}

export function SheetEditor({
  text: plainText,
  chordProBody,
  editDocId,
  onCreated,
  onUpdated,
  onCancel,
}: SheetEditorProps) {
  // Text state (single source of truth)
  const chordText = useChordInput((s) => s.text)
  const setChordMode = useChordInput((s) => s.setMode)
  const setText = useChordInput((s) => s.setText)
  const applyTextChange = useChordInput((s) => s.applyTextChange)
  const chordReset = useChordInput((s) => s.reset)
  const chordUndo = useChordInput((s) => s.undo)
  const undoStackLen = useChordInput((s) => s.undoStack.length)

  // Tool state
  const activeToolInStore = useChordInput((s) => s.activeTool)
  const setChordTool = useChordInput((s) => s.setActiveTool)
  const chordBuilder = useChordInput((s) => s.chordBuilder)
  const clearBuilder = useChordInput((s) => s.clearBuilder)
  const toolText = useChordInput((s) => s.toolText)

  const [activeTool, setActiveToolLocal] = useState<ActiveTool>(null)
  const [saving, setSaving] = useState(false)
  const [previewCho, setPreviewCho] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const isEditMode = editDocId != null

  useEffect(() => {
    const initial = chordProBody ?? plainText ?? ''
    setText(initial)
    setChordMode(true)
    return () => { setChordMode(false) }
  }, [plainText, chordProBody, setText, setChordMode])

  useEffect(() => {
    if (activeToolInStore !== (activeTool === 'chord' ? 'chord' : null)) {
      setChordTool(activeTool === 'chord' ? 'chord' : null)
    }
  }, [activeTool, activeToolInStore, setChordTool])

  const selectTool = useCallback(
    (tool: ActiveTool) => {
      setActiveToolLocal(tool)
    },
    [],
  )

  /** Gibt [start, end] der aktuellen Textarea-Selektion zurueck.
   *  Falls die Textarea nicht fokussiert ist, fallback auf Text-Ende. */
  const getSelection = (): { start: number; end: number } => {
    const ta = textareaRef.current
    if (!ta) return { start: chordText.length, end: chordText.length }
    return { start: ta.selectionStart, end: ta.selectionEnd }
  }

  const refocusCaret = (pos: number) => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(pos, pos)
    })
  }

  const refocusRange = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(start, end)
    })
  }

  const insertChordAtCursor = () => {
    const token = chordBuilder.trim()
    if (!token || !isValidChord(token)) return
    const { start } = getSelection()
    const r = insertAtOffset(chordText, start, `[${token}]`)
    applyTextChange(r.text)
    clearBuilder()
    refocusCaret(r.caret)
  }

  const insertCommentAtCursor = () => {
    const body = toolText.trim()
    if (!body) return
    const { start } = getSelection()
    const r = insertAtOffset(chordText, start, `{c: ${body}}`)
    applyTextChange(r.text)
    refocusCaret(r.caret)
  }

  const applySectionWrap = (type: SectionType) => {
    const { start, end } = getSelection()
    const r = wrapLinesAsSection(chordText, start, end, type, toolText)
    applyTextChange(r.text)
    refocusRange(r.caret, r.caret)
  }

  const buildMergedCho = () => chordText

  const handlePreview = () => {
    setError(null)
    setPreviewCho(buildMergedCho())
  }

  const doSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const cho = buildMergedCho()
      if (isEditMode && editDocId != null) {
        await api(`/documents/${editDocId}/content`, {
          method: 'PUT',
          body: { content: cho },
        })
        onUpdated?.()
      } else if (onCreated) {
        await onCreated(cho)
      }
      setConfirmOverwrite(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveClick = () => {
    if (isEditMode) setConfirmOverwrite(true)
    else void doSave()
  }

  const handleClose = () => {
    chordReset()
    onCancel?.()
  }

  const handleUndo = () => {
    chordUndo()
  }

  /** Haupt-Aktion: entweder Insert (Akkord/Kommentar) oder Wrap (Sektion). */
  const handleToolApply = () => {
    if (activeTool === 'chord') return insertChordAtCursor()
    if (activeTool === 'comment') return insertCommentAtCursor()
    if (isSection(activeTool)) return applySectionWrap(activeTool)
  }

  const toolApplyDisabled =
    (activeTool === 'chord' && (chordBuilder.trim() === '' || !isValidChord(chordBuilder.trim()))) ||
    (activeTool === 'comment' && toolText.trim() === '') ||
    activeTool === null

  // ---- Editor commands (topbar Save / Close / Undo / Preview) ----------
  const hasContent = chordText.trim().length > 0
  const saveDisabled =
    saving ||
    !(onCreated || isEditMode) ||
    (!isEditMode && !hasContent)

  const saveTitle = isEditMode
    ? 'Speichern (überschreibt bestehende .cho)'
    : 'Als neue .cho speichern'

  const handlersRef = useRef({
    onSave: handleSaveClick,
    onClose: handleClose,
    onUndo: handleUndo,
    onClear: () => undefined,
    onPreview: handlePreview,
  })
  handlersRef.current = {
    onSave: handleSaveClick,
    onClose: handleClose,
    onUndo: handleUndo,
    onClear: () => undefined,
    onPreview: handlePreview,
  }

  const stableOnSave = useCallback(() => handlersRef.current.onSave(), [])
  const stableOnClose = useCallback(() => handlersRef.current.onClose(), [])
  const stableOnUndo = useCallback(() => handlersRef.current.onUndo(), [])
  const stableOnClear = useCallback(() => handlersRef.current.onClear(), [])
  const stableOnPreview = useCallback(() => handlersRef.current.onPreview(), [])

  useEffect(() => {
    useEditorCommands.getState().activate({
      saving,
      saveDisabled,
      saveTitle,
      onSave: stableOnSave,
      onClose: stableOnClose,
      undoDisabled: undoStackLen === 0,
      clearDisabled: true,
      clearTitle: '',
      previewDisabled: !hasContent,
      onUndo: stableOnUndo,
      onClear: stableOnClear,
      onPreview: stableOnPreview,
    })
    return () => {
      useEditorCommands.getState().deactivate()
    }
  }, [
    saving, saveDisabled, saveTitle, hasContent, undoStackLen,
    stableOnSave, stableOnClose, stableOnUndo, stableOnClear, stableOnPreview,
  ])

  return (
    <div className="sheet-editor">
      <SheetEditToolbar
        activeTool={activeTool}
        onSelectTool={selectTool}
        onToolApply={handleToolApply}
        toolApplyDisabled={toolApplyDisabled}
      />

      {error && <div className="sheet-editor-error">{error}</div>}

      <SyntaxTextarea
        value={chordText}
        onChange={applyTextChange}
        textareaRef={textareaRef}
      />

      {confirmOverwrite && (
        <div
          className="sheet-editor-preview-overlay"
          onClick={() => !saving && setConfirmOverwrite(false)}
        >
          <div
            className="sheet-editor-preview-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420 }}
          >
            <div className="sheet-editor-preview-header">
              <span>Datei überschreiben?</span>
            </div>
            <div className="sheet-editor-confirm-body">
              Der aktuelle Inhalt der .cho-Datei wird mit deinen Änderungen
              ersetzt.
            </div>
            <div className="sheet-editor-confirm-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirmOverwrite(false)}
                disabled={saving}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={doSave}
                disabled={saving}
              >
                {saving ? 'Speichern...' : 'Überschreiben'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewCho !== null && (
        <div className="sheet-editor-preview-overlay" onClick={() => setPreviewCho(null)}>
          <div
            className="sheet-editor-preview-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-editor-preview-header">
              <span>ChordPro-Vorschau</span>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setPreviewCho(null)}
              >
                <X size={18} />
              </button>
            </div>
            <pre className="sheet-editor-preview-body">{previewCho}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
