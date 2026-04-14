import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Save, X, Eye } from 'lucide-react'
import { useChordInput } from '@/hooks/useChordInput'
import { ChordKeypadPopover } from './ChordKeypadPopover'
import { ChordLoupe } from './ChordLoupe'
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
    moveChord,
    setActiveCell,
    exportChordPro,
    updateCho,
    reset,
  } = useChordInput()

  const [saving, setSaving] = useState(false)
  const [previewCho, setPreviewCho] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [popoverOpen, setPopoverOpen] = useState(false)

  // Chord-chip drag state (long-press → loupe → move)
  const [dragging, setDragging] = useState<
    | {
        line: number
        col: number
        chord: string
        pointerId: number
        loupeX: number
        loupeY: number
      }
    | null
  >(null)
  const chipLongPressTimer = useRef<number | null>(null)
  const chipPressStart = useRef<{
    line: number
    col: number
    chord: string
    pointerId: number
    x: number
    y: number
  } | null>(null)
  const chipFiredLongPress = useRef(false)
  const lineRowRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  const longPressTimer = useRef<number | null>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const firedLongPress = useRef(false)

  const isEditMode = editDocId != null
  const LONG_PRESS_MS = 450
  const MOVE_TOLERANCE = 10

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

  useEffect(() => {
    return () => {
      if (longPressTimer.current != null) window.clearTimeout(longPressTimer.current)
    }
  }, [])

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

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleCharPointerDown = useCallback(
    (line: number, col: number, e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      firedLongPress.current = false
      pressStart.current = { x: e.clientX, y: e.clientY }
      setActiveCell({ line, col })
      clearLongPressTimer()
      longPressTimer.current = window.setTimeout(() => {
        firedLongPress.current = true
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate?.(30) } catch {}
        }
        setPopoverOpen(true)
      }, LONG_PRESS_MS)
    },
    [setActiveCell, clearLongPressTimer],
  )

  const handleCharPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pressStart.current) return
      const dx = Math.abs(e.clientX - pressStart.current.x)
      const dy = Math.abs(e.clientY - pressStart.current.y)
      if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
        clearLongPressTimer()
        pressStart.current = null
      }
    },
    [clearLongPressTimer],
  )

  const handleCharPointerUp = useCallback(() => {
    clearLongPressTimer()
    pressStart.current = null
  }, [clearLongPressTimer])

  const handleCharDoubleClick = useCallback(
    (line: number, col: number) => {
      setActiveCell({ line, col })
      setPopoverOpen(true)
    },
    [setActiveCell],
  )

  const handleChipClick = useCallback(
    (line: number, col: number) => {
      setActiveCell({ line, col })
      setPopoverOpen(true)
    },
    [setActiveCell],
  )

  // --- Chord-Chip Drag (Lupe auf Mobile, Drag auf Desktop) ---

  const clearChipLongPressTimer = useCallback(() => {
    if (chipLongPressTimer.current != null) {
      window.clearTimeout(chipLongPressTimer.current)
      chipLongPressTimer.current = null
    }
  }, [])

  /** Compute the target column on a given line from a viewport x-coordinate. */
  const colFromClientX = useCallback(
    (line: number, clientX: number): number => {
      const row = lineRowRefs.current.get(line)
      if (!row) return 0
      const lineText = lines[line] ?? ''
      const len = lineText.length
      if (len === 0) return 0
      const rect = row.getBoundingClientRect()
      const relative = clientX - rect.left
      const charWidth = rect.width / len
      if (charWidth <= 0) return 0
      const col = Math.round(relative / charWidth)
      if (col < 0) return 0
      if (col > len - 1) return len - 1
      return col
    },
    [lines],
  )

  const handleChipPointerDown = useCallback(
    (line: number, col: number, chord: string, e: React.PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      chipFiredLongPress.current = false
      chipPressStart.current = { line, col, chord, pointerId: e.pointerId, x: e.clientX, y: e.clientY }
      e.currentTarget.setPointerCapture(e.pointerId)
      clearChipLongPressTimer()
      chipLongPressTimer.current = window.setTimeout(() => {
        chipFiredLongPress.current = true
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate?.(30) } catch { /* no-op */ }
        }
        const start = chipPressStart.current
        if (!start) return
        setActiveCell({ line: start.line, col: start.col })
        setDragging({
          line: start.line,
          col: start.col,
          chord: start.chord,
          pointerId: start.pointerId,
          loupeX: start.x,
          loupeY: start.y,
        })
      }, LONG_PRESS_MS)
    },
    [clearChipLongPressTimer, setActiveCell],
  )

  const handleChipPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const start = chipPressStart.current
      if (!start) return
      // Cancel long-press if finger moves before timer fires
      if (!chipFiredLongPress.current) {
        const dx = Math.abs(e.clientX - start.x)
        const dy = Math.abs(e.clientY - start.y)
        if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
          clearChipLongPressTimer()
          chipPressStart.current = null
        }
        return
      }
      // Long-press fired → live move
      setDragging((d) => {
        if (!d || d.pointerId !== e.pointerId) return d
        const targetCol = colFromClientX(d.line, e.clientX)
        if (targetCol !== d.col) {
          const moved = moveChord(d.line, d.col, targetCol)
          if (moved) {
            setActiveCell({ line: d.line, col: targetCol })
            return { ...d, col: targetCol, loupeX: e.clientX, loupeY: e.clientY }
          }
        }
        return { ...d, loupeX: e.clientX, loupeY: e.clientY }
      })
    },
    [clearChipLongPressTimer, colFromClientX, moveChord, setActiveCell],
  )

  const handleChipPointerUp = useCallback(
    (line: number, col: number, e: React.PointerEvent) => {
      clearChipLongPressTimer()
      const fired = chipFiredLongPress.current
      chipPressStart.current = null
      chipFiredLongPress.current = false
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* no-op */ }
      if (fired) {
        // End move mode — position already committed via live move
        setDragging(null)
      } else {
        // Short tap → open keypad popover
        handleChipClick(line, col)
      }
    },
    [clearChipLongPressTimer, handleChipClick],
  )

  // --- Keyboard: ← / → moves the active chord one column ---
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (!activeCell) return
      // Ignore when a text input is focused (popover search, etc.)
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const srcKey = `${activeCell.line}:${activeCell.col}`
      if (!chords[srcKey]) return
      const lineText = lines[activeCell.line] ?? ''
      if (lineText.length === 0) return
      const dir = e.key === 'ArrowLeft' ? -1 : 1
      const newCol = activeCell.col + dir
      if (newCol < 0 || newCol > lineText.length - 1) return
      if (chords[`${activeCell.line}:${newCol}`]) return
      e.preventDefault()
      const ok = moveChord(activeCell.line, activeCell.col, newCol)
      if (ok) setActiveCell({ line: activeCell.line, col: newCol })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeCell, chords, lines, moveChord, setActiveCell])

  const closePopover = useCallback(() => setPopoverOpen(false), [])

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
        <div className="chord-input-toolbar-top">
          <div className="chord-input-status">
            {chordCount > 0
              ? `${chordCount} Akkord${chordCount === 1 ? '' : 'e'} · Lang-Tippen auf Akkord = verschieben · ←/→ schiebt aktiven Akkord`
              : 'Tippen = Position · Lang tippen = Akkord setzen'}
          </div>
          {onCancel && (
            <button
              type="button"
              className="chord-input-close"
              onClick={onCancel}
              aria-label="Schliessen"
              title="Schliessen"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="chord-input-toolbar-actions">
          <button
            type="button"
            className="btn btn-secondary chord-input-action"
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
              className="btn btn-primary chord-input-action"
              onClick={handleSaveClick}
              disabled={saving || (!isEditMode && chordCount === 0)}
            >
              <Save size={16} />
              {saving
                ? 'Speichern...'
                : isEditMode
                  ? 'Speichern'
                  : 'Als .cho'}
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
                {lineChords.map(({ col, chord }) => {
                  const isDragging =
                    dragging?.line === lineIndex && dragging?.col === col
                  return (
                    <span
                      key={col}
                      className={
                        'chord-input-chord' +
                        (isDragging ? ' chord-input-chord--dragging' : '')
                      }
                      style={{ left: `${col}ch` }}
                      onPointerDown={(e) => handleChipPointerDown(lineIndex, col, chord, e)}
                      onPointerMove={handleChipPointerMove}
                      onPointerUp={(e) => handleChipPointerUp(lineIndex, col, e)}
                      onPointerCancel={(e) => handleChipPointerUp(lineIndex, col, e)}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      {chord}
                    </span>
                  )
                })}
              </div>
              <div
                className="chord-input-text-row"
                ref={(el) => {
                  if (el) lineRowRefs.current.set(lineIndex, el)
                  else lineRowRefs.current.delete(lineIndex)
                }}
              >
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
                        onPointerDown={(e) => handleCharPointerDown(lineIndex, col, e)}
                        onPointerMove={handleCharPointerMove}
                        onPointerUp={handleCharPointerUp}
                        onPointerCancel={handleCharPointerUp}
                        onPointerLeave={handleCharPointerUp}
                        onContextMenu={(e) => e.preventDefault()}
                        onDoubleClick={() => handleCharDoubleClick(lineIndex, col)}
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

      {dragging && (
        <ChordLoupe
          x={dragging.loupeX}
          y={dragging.loupeY}
          lineText={lines[dragging.line] ?? ''}
          col={dragging.col}
          chord={dragging.chord}
        />
      )}

      {popoverOpen && activeCell && (
        <ChordKeypadPopover
          lineText={activeLineText}
          lineIndex={activeCell.line}
          col={activeCell.col}
          initialChord={initialChord}
          onSet={setChord}
          onRemove={removeChord}
          onClose={closePopover}
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
