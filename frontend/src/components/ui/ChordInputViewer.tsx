import { useCallback, useEffect, useMemo, useState } from 'react'
import { Save, X, Eye } from 'lucide-react'
import { useChordInput } from '@/hooks/useChordInput'
import { ChordKeypadPopover } from './ChordKeypadPopover'
import './ChordInputViewer.css'

interface ChordInputViewerProps {
  /** Plain source (.txt) — used when creating a new chord-sheet. */
  text?: string
  /** Existing ChordPro body (.cho) — used when editing in place. */
  chordProBody?: string
  /** When set, Save overwrites this document via PUT /content. */
  editDocId?: number
  /** Called after a new .cho has been created from plain text. */
  onCreated?: (cho: string) => void | Promise<void>
  /** Called after an existing .cho has been updated. */
  onUpdated?: () => void
  onCancel?: () => void
}

export function ChordInputViewer({
  text,
  chordProBody,
  editDocId,
  onCreated,
  onUpdated,
  onCancel,
}: ChordInputViewerProps) {
  const {
    text: storedText,
    chords,
    activeCell,
    setMode,
    setText,
    loadFromChordPro,
    setChord,
    removeChord,
    setActiveCell,
    exportChordPro,
    updateCho,
    reset,
  } = useChordInput()

  const [saving, setSaving] = useState(false)
  const [previewCho, setPreviewCho] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)

  const isEditMode = editDocId != null

  useEffect(() => {
    if (chordProBody != null) {
      loadFromChordPro(chordProBody)
    } else {
      setText(text ?? '')
      reset()
    }
    setMode(true)
    return () => setMode(false)
  }, [text, chordProBody, setText, loadFromChordPro, reset, setMode])

  const lines = useMemo(() => storedText.split('\n'), [storedText])

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

  const handleCharClick = useCallback(
    (line: number, col: number) => {
      setActiveCell({ line, col })
    },
    [setActiveCell],
  )

  const handlePreview = async () => {
    setError(null)
    try {
      const cho = await exportChordPro()
      setPreviewCho(cho)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vorschau fehlgeschlagen')
    }
  }

  const doSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (isEditMode && editDocId != null) {
        await updateCho(editDocId)
        onUpdated?.()
      } else if (onCreated) {
        const cho = await exportChordPro()
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
    if (isEditMode) {
      setConfirmOverwrite(true)
    } else {
      doSave()
    }
  }

  const activeLineText =
    activeCell !== null ? lines[activeCell.line] ?? '' : ''
  const activeChordKey =
    activeCell !== null ? `${activeCell.line}:${activeCell.col}` : null
  const initialChord =
    activeChordKey && chords[activeChordKey] ? chords[activeChordKey] : ''

  return (
    <div className="chord-input-viewer">
      <div className="chord-input-toolbar">
        <div className="chord-input-status">
          {chordCount > 0
            ? `${chordCount} Akkord${chordCount === 1 ? '' : 'e'} gesetzt`
            : 'Tippe auf eine Silbe, um einen Akkord zu setzen'}
        </div>
        <div className="chord-input-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handlePreview}
            disabled={chordCount === 0}
            title="ChordPro-Vorschau"
          >
            <Eye size={16} />
            Vorschau
          </button>
          {(onCreated || isEditMode) && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveClick}
              disabled={saving || (!isEditMode && chordCount === 0)}
            >
              <Save size={16} />
              {saving
                ? 'Speichern...'
                : isEditMode
                  ? 'Speichern'
                  : 'Als .cho speichern'}
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              className="btn btn-secondary chord-input-close"
              onClick={onCancel}
              aria-label="Schliessen"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {error && <div className="chord-input-error">{error}</div>}

      <div className="chord-input-text chord-input-text--mode">
        {lines.map((line, lineIndex) => {
          const lineChords = chordsByLine.get(lineIndex) ?? []
          return (
            <div key={lineIndex} className="chord-input-line">
              <div className="chord-input-chord-row">
                {lineChords.map(({ col, chord }) => (
                  <span
                    key={col}
                    className="chord-input-chord"
                    style={{ left: `${col}ch` }}
                    onClick={() => handleCharClick(lineIndex, col)}
                  >
                    {chord}
                  </span>
                ))}
              </div>
              <div className="chord-input-text-row">
                {line.length === 0 ? (
                  <span className="chord-input-empty">&nbsp;</span>
                ) : (
                  [...line].map((ch, col) => {
                    const isActive =
                      activeCell?.line === lineIndex && activeCell?.col === col
                    const hasChord = chords[`${lineIndex}:${col}`] != null
                    return (
                      <span
                        key={col}
                        className={
                          'chord-input-char chord-input-char--tappable' +
                          (isActive ? ' chord-input-char--active' : '') +
                          (hasChord ? ' chord-input-char--has-chord' : '')
                        }
                        onClick={() => handleCharClick(lineIndex, col)}
                      >
                        {ch === ' ' ? '\u00A0' : ch}
                      </span>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      {activeCell && (
        <ChordKeypadPopover
          lineText={activeLineText}
          lineIndex={activeCell.line}
          col={activeCell.col}
          initialChord={initialChord}
          onSet={setChord}
          onRemove={removeChord}
          onClose={() => setActiveCell(null)}
        />
      )}

      {confirmOverwrite && (
        <div
          className="chord-input-preview-overlay"
          onClick={() => !saving && setConfirmOverwrite(false)}
        >
          <div
            className="chord-input-preview-panel"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420 }}
          >
            <div className="chord-input-preview-header">
              <span>Chord-Sheet ueberschreiben?</span>
            </div>
            <div style={{ padding: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Der aktuelle Inhalt der .cho-Datei wird mit deinen Aenderungen
              ersetzt. Andere Akkorde oder Direktiven, die nicht ueber diesen
              Editor gesetzt wurden, koennen verlorengehen.
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', padding: 'var(--space-3)', borderTop: '1px solid var(--border)' }}>
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

      {previewCho !== null && (
        <div className="chord-input-preview-overlay" onClick={() => setPreviewCho(null)}>
          <div
            className="chord-input-preview-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="chord-input-preview-header">
              <span>ChordPro-Vorschau</span>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setPreviewCho(null)}
              >
                <X size={18} />
              </button>
            </div>
            <pre className="chord-input-preview-body">{previewCho}</pre>
          </div>
        </div>
      )}
    </div>
  )
}
