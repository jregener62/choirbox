import { Delete } from 'lucide-react'
import { useChordInput } from '@/hooks/useChordInput'
import { isValidChord } from '@/utils/chordValidation'
import './SheetEditToolbar.css'

export type ActiveTool = 'chord' | 'source' | null

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
  const chordBuilder = useChordInput((s) => s.chordBuilder)
  const appendBuilder = useChordInput((s) => s.appendBuilder)
  const backspaceBuilder = useChordInput((s) => s.backspaceBuilder)
  const clearBuilder = useChordInput((s) => s.clearBuilder)

  const displayToken = chordBuilder.replaceAll('#', '♯').replaceAll('b', '♭')
  const chordValid = chordBuilder !== '' && isValidChord(chordBuilder)
  const chordShowError = chordBuilder !== '' && !chordValid

  const toggle = (tool: Exclude<ActiveTool, null>) =>
    onSelectTool(activeTool === tool ? null : tool)

  return (
    <div className="set-toolbar" role="toolbar" aria-label="Bearbeiten">
      <div className="set-main-row">
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
          className={`set-tool set-tool--source${activeTool === 'source' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('source')}
          title="Quelltext bearbeiten"
          aria-pressed={activeTool === 'source'}
        >
          <span className="set-tool-label">Text</span>
        </button>
      </div>

      {activeTool === 'chord' && (
        <div className="set-sub-row">
          <div className="set-sub-row-line">
            <div className="set-keypad-group">
              {NOTES.map((n) => (
                <button key={n} type="button" className="set-key set-key--note" onClick={() => appendBuilder(n)}>{n}</button>
              ))}
            </div>
            <div className={`set-preview${chordShowError ? ' set-preview--error' : ''}`}>
              {chordBuilder ? (
                <>
                  <span className="set-preview-token">{displayToken}</span>
                  {!chordValid && <span className="set-preview-hint">ungültig</span>}
                </>
              ) : (
                <span className="set-preview-hint set-preview-hint--empty">bauen…</span>
              )}
            </div>
          </div>
          <div className="set-sub-row-line">
            <div className="set-keypad-group">
              {ACCIDENTALS.map((a) => (
                <button key={a} type="button" className="set-key set-key--mod" onClick={() => appendBuilder(a)}>{a === '#' ? '♯' : '♭'}</button>
              ))}
              {QUALITIES.map((q) => (
                <button key={q} type="button" className="set-key set-key--mod" onClick={() => appendBuilder(q)}>{q}</button>
              ))}
            </div>
            <div className="set-keypad-group">
              {NUMBERS.map((n) => (
                <button key={n} type="button" className="set-key set-key--num" onClick={() => appendBuilder(n)}>{n}</button>
              ))}
              <button type="button" className="set-key set-key--mod" onClick={() => appendBuilder('/')} title="Slash (Bass-Note)">/</button>
            </div>
            <div className="set-keypad-group set-keypad-group--actions">
              <button type="button" className="set-key set-key--util" onClick={backspaceBuilder} disabled={chordBuilder.length === 0} title="Letztes Zeichen entfernen"><Delete size={16} /></button>
              <button type="button" className="set-key set-key--util" onClick={clearBuilder} disabled={chordBuilder.length === 0} title="Akkord leeren">×</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
