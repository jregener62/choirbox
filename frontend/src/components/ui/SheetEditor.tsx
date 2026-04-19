import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '@/api/client.ts'
import { useChordInput } from '@/hooks/useChordInput'
import { useEditorCommands } from '@/hooks/useEditorCommands'
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


export function SheetEditor({
  text,
  chordProBody,
  editDocId,
  onCreated,
  onUpdated,
  onCancel,
}: SheetEditorProps) {
  // Chord hook
  const chordText = useChordInput((s) => s.text)
  const chords = useChordInput((s) => s.chords)
  const setChordMode = useChordInput((s) => s.setMode)
  const setChordText = useChordInput((s) => s.setText)
  const loadChordFrom = useChordInput((s) => s.loadFromChordPro)
  const chordToggleAt = useChordInput((s) => s.toggleAt)
  const chordUndo = useChordInput((s) => s.undo)
  const chordClearAll = useChordInput((s) => s.clearAll)
  const chordReset = useChordInput((s) => s.reset)
  const setChordTool = useChordInput((s) => s.setActiveTool)

  const [activeTool, setActiveToolLocal] = useState<ActiveTool>(null)
  const [saving, setSaving] = useState(false)
  const [previewCho, setPreviewCho] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  /** Raw source for the source-editor (syntax-highlighted textarea). */
  const [sourceText, setSourceText] = useState('')
  /** Ref auf das Source-Textarea — wird von SyntaxTextarea gespiegelt, damit
   *  die Marker-Buttons den Cursor lesen und Text an der richtigen Stelle
   *  einfuegen koennen. */
  const sourceTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  /** Action history — now only tracks chord actions. */
  const actionStack = useRef<Array<'chord'>>([])

  const isEditMode = editDocId != null

  useEffect(() => {
    const raw = chordProBody ?? text ?? ''
    setSourceText(raw)
    if (chordProBody != null) {
      loadChordFrom(chordProBody)
    } else {
      setChordText(text ?? '')
      chordReset()
    }
    setChordMode(true)
    actionStack.current = []
    return () => {
      setChordMode(false)
    }
  }, [
    text, chordProBody,
    setChordText,
    loadChordFrom,
    chordReset,
    setChordMode,
  ])

  const buildMergedCho = async () => {
    const chordList = useChordInput.getState().list()
    const textNow = useChordInput.getState().text
    const result = await api<{ cho_content: string }>('/chord-input/export', {
      method: 'POST',
      body: { text: textNow, chords: chordList },
    })
    return result.cho_content
  }

  // Switch between 'chord' and 'source' modes.
  const selectTool = useCallback(
    async (tool: ActiveTool) => {
      const prev = activeTool

      // Leaving source mode → re-parse sourceText into chord hook
      if (prev === 'source' && tool !== 'source') {
        loadChordFrom(sourceText)
      }

      // Entering source mode → build merged cho from chord hook
      if (tool === 'source' && prev !== 'source') {
        try {
          const cho = await buildMergedCho()
          setSourceText(cho)
        } catch { /* keep current sourceText */ }
      }

      setActiveToolLocal(tool)
      setChordTool(tool === 'chord' ? 'chord' : null)
    },
    [activeTool, sourceText, setChordTool, loadChordFrom],
  )

  const lines = useMemo(() => chordText.split('\n'), [chordText])

  const chordsByLine = useMemo(() => {
    const map = new Map<number, { col: number; chord: string }[]>()
    for (const [key, chord] of Object.entries(chords)) {
      const [line, col] = key.split(':').map(Number)
      if (!map.has(line)) map.set(line, [])
      map.get(line)!.push({ col, chord })
    }
    return map
  }, [chords])

  const chordCount = Object.keys(chords).length
  const totalCount = chordCount

  const handleCharClick = useCallback(
    (line: number, col: number) => {
      if (activeTool === 'chord') {
        if (chordToggleAt(line, col)) actionStack.current.push('chord')
      }
    },
    [activeTool, chordToggleAt],
  )

  const handleUndo = useCallback(() => {
    const last = actionStack.current[actionStack.current.length - 1]
    if (!last) return
    actionStack.current = actionStack.current.slice(0, -1)
    if (last === 'chord') chordUndo()
  }, [chordUndo])

  const handleClearActiveTool = useCallback(() => {
    if (activeTool === 'chord') {
      chordClearAll()
      actionStack.current = actionStack.current.filter((x) => x !== 'chord')
    }
  }, [activeTool, chordClearAll])

  const clearDisabled =
    activeTool !== 'chord' || chordCount === 0

  const handlePreview = async () => {
    setError(null)
    try {
      const cho = await buildMergedCho()
      setPreviewCho(cho)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vorschau fehlgeschlagen')
    }
  }

  const doSave = async () => {
    setSaving(true)
    setError(null)
    try {
      // In source mode, save the raw textarea content directly.
      // In tool mode, build merged ChordPro from both hooks.
      const cho = activeTool === 'source' ? sourceText : await buildMergedCho()
      if (isEditMode && editDocId != null) {
        await api(`/documents/${editDocId}/content`, {
          method: 'PUT',
          body: { content: cho },
        })
        onUpdated?.()
      } else if (onCreated) {
        await onCreated(cho)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
      setConfirmOverwrite(false)
    }
  }

  const handleSaveClick = () => {
    if (isEditMode) setConfirmOverwrite(true)
    else doSave()
  }

  const saveTitle = isEditMode
    ? 'Speichern (überschreibt bestehende .cho)'
    : 'Als neue .cho speichern'

  const saveDisabled =
    saving ||
    !(onCreated || isEditMode) ||
    (!isEditMode && totalCount === 0)

  const clearTitle =
    activeTool === 'chord' ? 'Alle Akkorde löschen' : 'Löschen (Tool wählen)'

  // Latest-closure refs so we can hand stable callback wrappers to the store
  // without retriggering subscribers on every render.
  const handlersRef = useRef({
    onSave: handleSaveClick,
    onClose: onCancel ?? (() => { /* noop */ }),
    onUndo: handleUndo,
    onClear: handleClearActiveTool,
    onPreview: handlePreview,
  })
  handlersRef.current = {
    onSave: handleSaveClick,
    onClose: onCancel ?? (() => { /* noop */ }),
    onUndo: handleUndo,
    onClear: handleClearActiveTool,
    onPreview: handlePreview,
  }

  const stableOnSave = useCallback(() => handlersRef.current.onSave(), [])
  const stableOnClose = useCallback(() => handlersRef.current.onClose(), [])
  const stableOnUndo = useCallback(() => handlersRef.current.onUndo(), [])
  const stableOnClear = useCallback(() => handlersRef.current.onClear(), [])
  const stableOnPreview = useCallback(() => handlersRef.current.onPreview(), [])


  // Register editor commands so the page topbar / file-info bar can render actions.
  useEffect(() => {
    useEditorCommands.getState().activate({
      saving,
      saveDisabled,
      saveTitle,
      onSave: stableOnSave,
      onClose: stableOnClose,
      undoDisabled: true,
      clearDisabled,
      clearTitle,
      previewDisabled: totalCount === 0,
      onUndo: stableOnUndo,
      onClear: stableOnClear,
      onPreview: stableOnPreview,
    })
    return () => {
      useEditorCommands.getState().deactivate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync flags (primitives only, no callbacks → no render loop).
  useEffect(() => {
    useEditorCommands.getState().update({
      saving,
      saveDisabled,
      saveTitle,
      clearDisabled,
      clearTitle,
      previewDisabled: totalCount === 0,
      sourceMode: activeTool === 'source',
    })
  }, [saving, saveDisabled, saveTitle, clearDisabled, clearTitle, totalCount, activeTool])

  // Sync undo-disabled based on actionStack depth.
  useEffect(() => {
    useEditorCommands.getState().update({
      undoDisabled: actionStack.current.length === 0,
    })
  }, [chords])

  const textClass =
    'sheet-editor-text' +
    (activeTool === 'chord' ? ' sheet-editor-text--mode-chord' : '')

  return (
    <div className="sheet-editor">
      <SheetEditToolbar
        activeTool={activeTool}
        onSelectTool={selectTool}
      />

      {error && <div className="sheet-editor-error">{error}</div>}

      {activeTool === 'source' ? (
        <SyntaxTextarea
          value={sourceText}
          onChange={setSourceText}
          textareaRef={sourceTextareaRef}
        />
      ) : (
      <div className={textClass}>
        {lines.map((line, lineIndex) => {
          const lineChords = chordsByLine.get(lineIndex) ?? []
          return (
            <div key={lineIndex} className="sheet-editor-line">
              <div className="sheet-editor-line-body">
              <div className="sheet-editor-chord-row">
                {lineChords.map(({ col, chord }) => (
                  <span
                    key={col}
                    className="sheet-editor-chord"
                    style={{ left: `${col}ch` }}
                    onClick={() => handleCharClick(lineIndex, col)}
                    title={activeTool === 'chord' ? 'Tap entfernt diesen Akkord' : chord}
                  >
                    {chord}
                  </span>
                ))}
              </div>
              <div className="sheet-editor-text-row">
                {line.length === 0 ? (
                  <span className="sheet-editor-empty">&nbsp;</span>
                ) : (
                  [...line].map((ch, col) => {
                    const hasChord = chords[`${lineIndex}:${col}`] != null
                    return (
                      <span
                        key={col}
                        className={
                          'sheet-editor-char' +
                          (activeTool ? ' sheet-editor-char--tappable' : '') +
                          (hasChord ? ' sheet-editor-char--has-chord' : '')
                        }
                        data-line={lineIndex}
                        data-col={col}
                        onClick={() => handleCharClick(lineIndex, col)}
                        onContextMenu={(e) => e.preventDefault()}
                      >
                        {ch === ' ' ? '\u00A0' : ch}
                      </span>
                    )
                  })
                )}
              </div>
              </div>
            </div>
          )
        })}
      </div>
      )}

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
              ersetzt. Andere Direktiven, die nicht über diesen Editor gesetzt
              wurden, können verloren­gehen.
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
