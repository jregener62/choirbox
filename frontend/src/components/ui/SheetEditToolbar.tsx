import { Delete, Minus, Plus, X } from 'lucide-react'
import { useChordInput } from '@/hooks/useChordInput'
import { useVocalInput } from '@/hooks/useVocalInput'
import { isValidChord } from '@/utils/chordValidation'
import './SheetEditToolbar.css'

export type ActiveTool = 'chord' | 'beat' | 'interval' | 'note' | null

interface SheetEditToolbarProps {
  activeTool: ActiveTool
  onSelectTool: (tool: ActiveTool) => void
}

const NOTES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
const ACCIDENTALS = ['#', 'b'] as const
const QUALITIES = ['m', 'maj', 'sus', 'dim', 'aug'] as const
const NUMBERS = ['2', '4', '5', '6', '7', '9'] as const

export function SheetEditToolbar({
  activeTool,
  onSelectTool,
}: SheetEditToolbarProps) {
  // Chord-builder state from hook
  const chordBuilder = useChordInput((s) => s.chordBuilder)
  const appendBuilder = useChordInput((s) => s.appendBuilder)
  const backspaceBuilder = useChordInput((s) => s.backspaceBuilder)
  const clearBuilder = useChordInput((s) => s.clearBuilder)

  // Interval state from hook
  const intervalDir = useVocalInput((s) => s.intervalDir)
  const intervalNum = useVocalInput((s) => s.intervalNum)
  const setIntervalDir = useVocalInput((s) => s.setIntervalDir)
  const setIntervalNum = useVocalInput((s) => s.setIntervalNum)

  // Note state from hook
  const noteText = useVocalInput((s) => s.noteText)
  const setNoteText = useVocalInput((s) => s.setNoteText)
  const clearNoteText = useVocalInput((s) => s.clearNoteText)

  const displayToken = chordBuilder.replaceAll('#', '♯').replaceAll('b', '♭')
  const chordValid = chordBuilder !== '' && isValidChord(chordBuilder)
  const chordShowError = chordBuilder !== '' && !chordValid

  const toggle = (tool: Exclude<ActiveTool, null>) =>
    onSelectTool(activeTool === tool ? null : tool)

  return (
    <div className="set-toolbar" role="toolbar" aria-label="Bearbeiten">
      <div className="set-main-row">
        {/* Tool buttons */}
        <button
          type="button"
          className={`set-tool set-tool--chord${activeTool === 'chord' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('chord')}
          title="Akkord"
          aria-pressed={activeTool === 'chord'}
        >
          <span className="set-tool-label">Akkord</span>
        </button>

        <button
          type="button"
          className={`set-tool set-tool--beat${activeTool === 'beat' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('beat')}
          title="Taktanfang (Zählzeit 1)"
          aria-pressed={activeTool === 'beat'}
        >
          <span className="set-tool-label">Taktanfang</span>
        </button>

        <button
          type="button"
          className={`set-tool set-tool--interval${activeTool === 'interval' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('interval')}
          title="Intervall"
          aria-pressed={activeTool === 'interval'}
        >
          <span className="set-tool-label">Intervall</span>
        </button>

        <button
          type="button"
          className={`set-tool set-tool--note${activeTool === 'note' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('note')}
          title="Kommentar"
          aria-pressed={activeTool === 'note'}
        >
          <span className="set-tool-label">Kommentar</span>
        </button>

      </div>

      {/* Sub-row: chord keypad — two lines so preview sits next to A..G */}
      {activeTool === 'chord' && (
        <div className="set-sub-row">
          <div className="set-sub-row-line">
            <div className="set-keypad-group">
              {NOTES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="set-key set-key--note"
                  onClick={() => appendBuilder(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className={`set-preview${chordShowError ? ' set-preview--error' : ''}`}>
              {chordBuilder ? (
                <>
                  <span className="set-preview-token">{displayToken}</span>
                  {!chordValid && <span className="set-preview-hint">ungültig</span>}
                </>
              ) : (
                <span className="set-preview-hint set-preview-hint--empty">
                  bauen…
                </span>
              )}
            </div>
          </div>

          <div className="set-sub-row-line">
            <div className="set-keypad-group">
              {ACCIDENTALS.map((a) => (
                <button
                  key={a}
                  type="button"
                  className="set-key set-key--mod"
                  onClick={() => appendBuilder(a)}
                >
                  {a === '#' ? '♯' : '♭'}
                </button>
              ))}
              {QUALITIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="set-key set-key--mod"
                  onClick={() => appendBuilder(q)}
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="set-keypad-group">
              {NUMBERS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className="set-key set-key--num"
                  onClick={() => appendBuilder(n)}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                className="set-key set-key--mod"
                onClick={() => appendBuilder('/')}
                title="Slash (Bass-Note)"
              >
                /
              </button>
            </div>
            <div className="set-keypad-group set-keypad-group--actions">
              <button
                type="button"
                className="set-key set-key--util"
                onClick={backspaceBuilder}
                disabled={chordBuilder.length === 0}
                title="Letztes Zeichen entfernen"
              >
                <Delete size={16} />
              </button>
              <button
                type="button"
                className="set-key set-key--util"
                onClick={clearBuilder}
                disabled={chordBuilder.length === 0}
                title="Akkord leeren"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-row: beat demo preview */}
      {activeTool === 'beat' && (
        <div className="set-sub-row">
          <div className="set-sub-row-line">
            <div className="set-preview set-preview--demo">
              <span className="set-beat-demo">
                <span className="set-beat-demo-char">T</span>akt
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sub-row: interval controls */}
      {activeTool === 'interval' && (
        <div className="set-sub-row">
          <div className="set-sub-row-line">
            <div className="set-preview">
              <span className="set-preview-token set-preview-token--interval">
                {intervalDir === '+' ? '↑' : '↓'}{intervalNum}
              </span>
            </div>
            <div className="set-direction-pill">
              <button
                type="button"
                className={`set-dir-btn${intervalDir === '+' ? ' set-dir-btn--active' : ''}`}
                onClick={() => setIntervalDir('+')}
                title="aufwärts"
                aria-pressed={intervalDir === '+'}
              >
                ↑
              </button>
              <button
                type="button"
                className={`set-dir-btn${intervalDir === '-' ? ' set-dir-btn--active' : ''}`}
                onClick={() => setIntervalDir('-')}
                title="abwärts"
                aria-pressed={intervalDir === '-'}
              >
                ↓
              </button>
            </div>
            <div className="set-number">
              <button
                type="button"
                className="set-num-btn"
                onClick={() => setIntervalNum(intervalNum - 1)}
                disabled={intervalNum <= 1}
                title="kleiner"
              >
                <Minus size={14} />
              </button>
              <span className="set-num-value">{intervalNum}</span>
              <button
                type="button"
                className="set-num-btn"
                onClick={() => setIntervalNum(intervalNum + 1)}
                disabled={intervalNum >= 12}
                title="größer"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-row: note text input */}
      {activeTool === 'note' && (
        <div className="set-sub-row">
          <div className="set-sub-row-line">
            <input
              type="text"
              className="set-note-input"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Kommentar eingeben, dann Zeichen antippen"
              autoFocus
            />
            <button
              type="button"
              className="set-note-clear"
              onClick={clearNoteText}
              disabled={noteText.length === 0}
              title="Text leeren"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
