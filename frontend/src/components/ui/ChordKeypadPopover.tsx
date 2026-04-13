import { useMemo, useState } from 'react'
import { Check, Delete, CornerDownLeft } from 'lucide-react'
import { Modal } from './Modal'
import { isValidChord } from '@/utils/chordValidation'
import './ChordKeypadPopover.css'

interface ChordKeypadPopoverProps {
  lineText: string
  lineIndex: number
  col: number
  initialChord?: string
  onSet: (line: number, col: number, chord: string) => void
  onRemove: (line: number, col: number) => void
  onClose: () => void
}

const NOTES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
const QUALITIES = ['m', 'maj', 'sus', 'dim', 'aug'] as const
const NUMBERS = ['2', '4', '5', '6', '7', '9'] as const

export function ChordKeypadPopover({
  lineText,
  lineIndex,
  col,
  initialChord = '',
  onSet,
  onRemove,
  onClose,
}: ChordKeypadPopoverProps) {
  const [token, setToken] = useState(initialChord)

  const targetChar = useMemo(() => {
    if (col < 0 || col >= lineText.length) return ''
    return lineText[col]
  }, [lineText, col])

  const wordContext = useMemo(() => {
    if (!lineText) return ''
    const start = lineText.lastIndexOf(' ', col - 1) + 1
    const endIdx = lineText.indexOf(' ', col)
    const end = endIdx === -1 ? lineText.length : endIdx
    return lineText.slice(start, end)
  }, [lineText, col])

  const append = (s: string) => setToken((prev) => prev + s)
  const backspace = () => setToken((prev) => prev.slice(0, -1))
  const clear = () => setToken('')

  const valid = token !== '' && isValidChord(token)
  const showError = token !== '' && !valid

  const handleSet = () => {
    if (!valid) return
    onSet(lineIndex, col, token)
    onClose()
  }

  const handleRemove = () => {
    onRemove(lineIndex, col)
    onClose()
  }

  return (
    <Modal title="Akkord setzen" onClose={onClose}>
      <div className="chord-keypad">
        <div className="chord-keypad-target">
          <div className="chord-keypad-label">Position</div>
          <div className="chord-keypad-context">
            {wordContext ? (
              <>
                <span className="chord-keypad-hint">in</span>{' '}
                <span className="chord-keypad-word">
                  {wordContext.split('').map((ch, i) => {
                    const absIdx = lineText.indexOf(wordContext) + i
                    return (
                      <span
                        key={i}
                        className={absIdx === col ? 'chord-keypad-target-char' : ''}
                      >
                        {ch}
                      </span>
                    )
                  })}
                </span>
              </>
            ) : (
              <span className="chord-keypad-hint">Zeile {lineIndex + 1}</span>
            )}
            {targetChar && (
              <span className="chord-keypad-char-badge">{targetChar}</span>
            )}
          </div>
        </div>

        <div className="chord-keypad-preview-row">
          <div>
            <div className="chord-keypad-label">Akkord</div>
            <div
              className={
                'chord-keypad-preview' + (showError ? ' chord-keypad-preview--error' : '')
              }
            >
              {token || <span className="chord-keypad-placeholder">leer</span>}
            </div>
          </div>
          <div className="chord-keypad-preview-actions">
            <button
              type="button"
              className="chord-keypad-iconbtn"
              onClick={backspace}
              disabled={!token}
              aria-label="Letztes Zeichen loeschen"
            >
              <Delete size={18} />
            </button>
            <button
              type="button"
              className="chord-keypad-textbtn"
              onClick={clear}
              disabled={!token}
            >
              Leeren
            </button>
          </div>
        </div>

        <div className="chord-keypad-row chord-keypad-notes">
          {NOTES.map((n) => (
            <button
              key={n}
              type="button"
              className="chord-key chord-key--note"
              onClick={() => append(n)}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="chord-keypad-row chord-keypad-mods">
          <button type="button" className="chord-key" onClick={() => append('#')}>
            ♯
          </button>
          <button type="button" className="chord-key" onClick={() => append('b')}>
            ♭
          </button>
          {QUALITIES.map((q) => (
            <button
              key={q}
              type="button"
              className="chord-key chord-key--qual"
              onClick={() => append(q)}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="chord-keypad-row chord-keypad-numbers">
          {NUMBERS.map((n) => (
            <button
              key={n}
              type="button"
              className="chord-key"
              onClick={() => append(n)}
            >
              {n}
            </button>
          ))}
          <button type="button" className="chord-key" onClick={() => append('/')}>
            /
          </button>
        </div>

        <div className="chord-keypad-actions">
          {initialChord && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleRemove}
            >
              Entfernen
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSet}
            disabled={!valid}
          >
            <Check size={16} />
            Setzen
          </button>
        </div>

        {showError && (
          <div className="chord-keypad-error">
            Ungueltiger Akkord — Beispiel: <code>Am7</code>, <code>D/F#</code>, <code>Cmaj7</code>
          </div>
        )}
        {!token && (
          <div className="chord-keypad-hint-line">
            <CornerDownLeft size={14} /> Baue den Akkord aus den Tasten zusammen
          </div>
        )}
      </div>
    </Modal>
  )
}
