import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { api } from '@/api/client.ts'
import { useChordInput } from '@/hooks/useChordInput'
import { useVocalInput } from '@/hooks/useVocalInput'
import { useEditorCommands } from '@/hooks/useEditorCommands'
import { SheetEditToolbar, type ActiveTool } from './SheetEditToolbar'
import { SyntaxTextarea } from './SyntaxTextarea'
import { getVocalMeta } from '@/utils/vocalValidation'
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

  // Vocal hook
  const vocalMarks = useVocalInput((s) => s.marks)
  const setVocalMode = useVocalInput((s) => s.setMode)
  const setVocalText = useVocalInput((s) => s.setText)
  const loadVocalFrom = useVocalInput((s) => s.loadFromChordPro)
  const vocalToggleAt = useVocalInput((s) => s.toggleAt)
  const vocalUndo = useVocalInput((s) => s.undo)
  const vocalClearAll = useVocalInput((s) => s.clearAll)
  const vocalReset = useVocalInput((s) => s.reset)
  const setVocalTool = useVocalInput((s) => s.setActiveTool)

  const [activeTool, setActiveToolLocal] = useState<ActiveTool>(null)
  const [saving, setSaving] = useState(false)
  const [previewCho, setPreviewCho] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  /** Raw source for the source-editor (syntax-highlighted textarea). */
  const [sourceText, setSourceText] = useState('')
  /** Global action history — tracks which hook produced each action. */
  const actionStack = useRef<Array<'chord' | 'vocal'>>([])

  const isEditMode = editDocId != null

  useEffect(() => {
    // Load both hooks from the same source so text + preserved* are in sync.
    const raw = chordProBody ?? text ?? ''
    setSourceText(raw)
    if (chordProBody != null) {
      loadChordFrom(chordProBody)
      loadVocalFrom(chordProBody)
    } else {
      setChordText(text ?? '')
      setVocalText(text ?? '')
      chordReset()
      vocalReset()
    }
    setChordMode(true)
    setVocalMode(true)
    actionStack.current = []
    return () => {
      setChordMode(false)
      setVocalMode(false)
    }
  }, [
    text, chordProBody,
    setChordText, setVocalText,
    loadChordFrom, loadVocalFrom,
    chordReset, vocalReset,
    setChordMode, setVocalMode,
  ])

  const buildMergedCho = async () => {
    const chordList = useChordInput.getState().list()
    const vocalList = useVocalInput.getState().list()
    const textNow = useChordInput.getState().text
    const result = await api<{ cho_content: string }>('/chord-input/export', {
      method: 'POST',
      body: { text: textNow, chords: chordList, vocals: vocalList },
    })
    return result.cho_content
  }

  // Coordinate tool selection: activating a tool in one hook deactivates the other.
  // When switching TO source: build merged cho into sourceText.
  // When switching FROM source: re-parse sourceText into both hooks.
  const selectTool = useCallback(
    async (tool: ActiveTool) => {
      const prev = activeTool

      // Leaving source mode → re-parse sourceText into hooks
      if (prev === 'source' && tool !== 'source') {
        loadChordFrom(sourceText)
        loadVocalFrom(sourceText)
      }

      // Entering source mode → build merged cho from hooks
      if (tool === 'source' && prev !== 'source') {
        try {
          const cho = await buildMergedCho()
          setSourceText(cho)
        } catch { /* keep current sourceText */ }
      }

      setActiveToolLocal(tool)
      if (tool === 'chord') {
        setChordTool('chord')
        setVocalTool(null)
      } else if (tool === 'beat' || tool === 'note') {
        setChordTool(null)
        setVocalTool(tool)
      } else {
        setChordTool(null)
        setVocalTool(null)
      }
    },
    [activeTool, sourceText, setChordTool, setVocalTool, loadChordFrom, loadVocalFrom],
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

  const linesData = useMemo(() => {
    return lines.map((lineText, lineIndex) => {
      const beatCols = new Set<number>()
      const notesTop: { col: number; token: string }[] = []
      const notesInline = new Map<number, string>()
      const notesBottom: { col: number; token: string }[] = []
      for (const [key, token] of Object.entries(vocalMarks)) {
        const [li, ci] = key.split(':').map(Number)
        if (li !== lineIndex) continue
        const meta = getVocalMeta(token)
        if (!meta) continue
        if (meta.category === 'beat') {
          beatCols.add(ci)
        } else if (meta.category === 'note-top') {
          notesTop.push({ col: ci, token })
        } else if (meta.category === 'note-inline') {
          notesInline.set(ci, token)
        } else if (meta.category === 'note-bottom') {
          notesBottom.push({ col: ci, token })
        }
      }
      notesTop.sort((a, b) => a.col - b.col)
      notesBottom.sort((a, b) => a.col - b.col)
      return { text: lineText, beatCols, notesTop, notesInline, notesBottom }
    })
  }, [lines, vocalMarks])

  const chordCount = Object.keys(chords).length
  const vocalCount = Object.keys(vocalMarks).length
  const totalCount = chordCount + vocalCount

  const handleCharClick = useCallback(
    (line: number, col: number) => {
      if (activeTool === 'chord') {
        if (chordToggleAt(line, col)) actionStack.current.push('chord')
      } else if (
        activeTool === 'beat' ||
        activeTool === 'note'
      ) {
        if (vocalToggleAt(line, col)) actionStack.current.push('vocal')
      }
    },
    [activeTool, chordToggleAt, vocalToggleAt],
  )

  const handleUndo = useCallback(() => {
    const last = actionStack.current[actionStack.current.length - 1]
    if (!last) return
    actionStack.current = actionStack.current.slice(0, -1)
    if (last === 'chord') chordUndo()
    else vocalUndo()
  }, [chordUndo, vocalUndo])

  const handleClearActiveTool = useCallback(() => {
    if (activeTool === 'chord') {
      chordClearAll()
      actionStack.current = actionStack.current.filter((x) => x !== 'chord')
    } else if (
      activeTool === 'beat' ||
      activeTool === 'note'
    ) {
      vocalClearAll()
      actionStack.current = actionStack.current.filter((x) => x !== 'vocal')
    }
  }, [activeTool, chordClearAll, vocalClearAll])

  const clearDisabled =
    (activeTool === 'chord' && chordCount === 0) ||
    ((activeTool === 'beat' || activeTool === 'note') &&
      vocalCount === 0) ||
    activeTool === null

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
    activeTool === 'chord'
      ? 'Alle Akkorde löschen'
      : activeTool === 'beat'
        ? 'Alle Taktanfänge löschen'
        : activeTool === 'note'
            ? 'Alle Kommentare löschen'
            : 'Löschen (Tool wählen)'

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
  }, [chords, vocalMarks])

  const textClass =
    'sheet-editor-text' +
    (activeTool === 'chord' ? ' sheet-editor-text--mode-chord' : '') +
    (activeTool === 'beat' ? ' sheet-editor-text--mode-beat' : '') +
    (activeTool === 'note' ? ' sheet-editor-text--mode-note' : '')

  return (
    <div className="sheet-editor">
      <SheetEditToolbar
        activeTool={activeTool}
        onSelectTool={selectTool}
      />

      {error && <div className="sheet-editor-error">{error}</div>}

      {activeTool === 'source' ? (
        <SyntaxTextarea value={sourceText} onChange={setSourceText} />
      ) : (
      <div className={textClass}>
        {lines.map((line, lineIndex) => {
          const ld = linesData[lineIndex]
          const lineChords = chordsByLine.get(lineIndex) ?? []
          return (
            <div key={lineIndex} className="sheet-editor-line">
              {ld.notesTop.length > 0 && (
                <div className="sheet-editor-note-row">
                  {ld.notesTop.map(({ col, token }) => {
                    const meta = getVocalMeta(token)
                    return (
                      <span key={`nt-${col}`} style={{ display: 'contents' }}>
                        <span
                          className="sheet-editor-note-pill sheet-editor-note-pill--top"
                          style={{ left: `${col}ch` }}
                          onClick={(e) => { e.stopPropagation(); handleCharClick(lineIndex, col) }}
                          title={meta?.label ?? token}
                        >
                          <span className="sheet-editor-note-pill-text">{meta?.label}</span>
                        </span>
                        <span className="sheet-editor-note-tail sheet-editor-note-tail--top" style={{ left: `calc(${col}ch + 0.5ch - 1px)` }} aria-hidden="true" />
                      </span>
                    )
                  })}
                </div>
              )}
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
                    const isBeat = ld.beatCols.has(col)
                    const hasChord = chords[`${lineIndex}:${col}`] != null
                    const inlineNote = ld.notesInline.get(col)
                    const inlineMeta = inlineNote ? getVocalMeta(inlineNote) : null
                    return (
                      <span key={col} style={{ display: 'contents' }}>
                        {inlineMeta && (
                          <span
                            className="sheet-editor-note-inline"
                            onClick={(e) => { e.stopPropagation(); handleCharClick(lineIndex, col) }}
                            title={inlineMeta.label}
                          >
                            {inlineMeta.label}
                          </span>
                        )}
                        <span
                          className={
                            'sheet-editor-char' +
                            (activeTool ? ' sheet-editor-char--tappable' : '') +
                            (hasChord ? ' sheet-editor-char--has-chord' : '') +
                            (isBeat ? ' sheet-editor-char--beat' : '')
                          }
                          onClick={() => handleCharClick(lineIndex, col)}
                          onContextMenu={(e) => e.preventDefault()}
                        >
                          {ch === ' ' ? '\u00A0' : ch}
                        </span>
                      </span>
                    )
                  })
                )}
              </div>
              </div>
              {ld.notesBottom.length > 0 && (
                <div className="sheet-editor-note-row sheet-editor-note-row--bottom">
                  {ld.notesBottom.map(({ col, token }) => {
                    const meta = getVocalMeta(token)
                    return (
                      <span key={`nb-${col}`} style={{ display: 'contents' }}>
                        <span className="sheet-editor-note-tail sheet-editor-note-tail--bottom" style={{ left: `calc(${col}ch + 0.5ch - 1px)` }} aria-hidden="true" />
                        <span
                          className="sheet-editor-note-pill sheet-editor-note-pill--bottom"
                          style={{ left: `${col}ch` }}
                          onClick={(e) => { e.stopPropagation(); handleCharClick(lineIndex, col) }}
                          title={meta?.label ?? token}
                        >
                          <span className="sheet-editor-note-pill-text">{meta?.label}</span>
                        </span>
                      </span>
                    )
                  })}
                </div>
              )}
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
