import { Check, Delete, X } from 'lucide-react'
import { useChordInput } from '@/hooks/useChordInput'
import { isValidChord } from '@/utils/chordValidation'
import './SheetEditToolbar.css'

export type ActiveTool =
  | 'chord'
  | 'comment'
  | 'verse'
  | 'chorus'
  | 'bridge'
  | 'intro'
  | 'interlude'
  | 'outro'
  | null

export type SectionTool = 'verse' | 'chorus' | 'bridge' | 'intro' | 'interlude' | 'outro'

interface SheetEditToolbarProps {
  activeTool: ActiveTool
  onSelectTool: (tool: ActiveTool) => void
  /** Aktion des aktiven Tools ausloesen — fuegt Akkord/Kommentar ein oder
   *  wrapt die Selektion als Sektion. */
  onToolApply: () => void
  toolApplyDisabled: boolean
}

const NOTES = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const
const ACCIDENTALS = ['#', 'b'] as const
const QUALITIES = ['m', 'maj', 'sus', 'dim', 'aug'] as const
const NUMBERS = ['2', '4', '5', '6', '7', '9'] as const

const SECTION_PLACEHOLDER: Record<SectionTool, string> = {
  verse: 'Strophe 1',
  chorus: 'Refrain',
  bridge: 'Bridge',
  intro: 'Intro',
  interlude: 'Zwischenspiel',
  outro: 'Outro',
}

const SECTION_HINT = 'Text markieren und dann „Selektion wrappen" — ohne Selektion wird ein Template eingefuegt'

const TOOL_HINT: Record<Exclude<ActiveTool, null | 'chord'>, string> = {
  comment: 'Text eingeben, dann „Einfuegen" — Kommentar wird am Cursor platziert',
  verse: SECTION_HINT,
  chorus: SECTION_HINT,
  bridge: SECTION_HINT,
  intro: SECTION_HINT,
  interlude: SECTION_HINT,
  outro: SECTION_HINT,
}

export function SheetEditToolbar({
  activeTool,
  onSelectTool,
  onToolApply,
  toolApplyDisabled,
}: SheetEditToolbarProps) {
  const chordBuilder = useChordInput((s) => s.chordBuilder)
  const appendBuilder = useChordInput((s) => s.appendBuilder)
  const backspaceBuilder = useChordInput((s) => s.backspaceBuilder)
  const clearBuilder = useChordInput((s) => s.clearBuilder)

  const toolText = useChordInput((s) => s.toolText)
  const setToolText = useChordInput((s) => s.setToolText)
  const clearToolText = useChordInput((s) => s.clearToolText)

  const displayToken = chordBuilder.replaceAll('#', '♯').replaceAll('b', '♭')
  const chordValid = chordBuilder !== '' && isValidChord(chordBuilder)
  const chordShowError = chordBuilder !== '' && !chordValid

  const toggle = (tool: Exclude<ActiveTool, null>) =>
    onSelectTool(activeTool === tool ? null : tool)

  const isSection =
    activeTool === 'verse' ||
    activeTool === 'chorus' ||
    activeTool === 'bridge' ||
    activeTool === 'intro' ||
    activeTool === 'interlude' ||
    activeTool === 'outro'

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
          className={`set-tool${activeTool === 'verse' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('verse')}
          title="Strophe"
          aria-pressed={activeTool === 'verse'}
        >
          <span className="set-tool-label">Strophe</span>
        </button>
        <button
          type="button"
          className={`set-tool${activeTool === 'chorus' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('chorus')}
          title="Refrain"
          aria-pressed={activeTool === 'chorus'}
        >
          <span className="set-tool-label">Refrain</span>
        </button>
        <button
          type="button"
          className={`set-tool${activeTool === 'bridge' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('bridge')}
          title="Bridge"
          aria-pressed={activeTool === 'bridge'}
        >
          <span className="set-tool-label">Bridge</span>
        </button>
        <button
          type="button"
          className={`set-tool${activeTool === 'intro' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('intro')}
          title="Intro"
          aria-pressed={activeTool === 'intro'}
        >
          <span className="set-tool-label">Intro</span>
        </button>
        <button
          type="button"
          className={`set-tool${activeTool === 'interlude' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('interlude')}
          title="Zwischenspiel"
          aria-pressed={activeTool === 'interlude'}
        >
          <span className="set-tool-label">Interlude</span>
        </button>
        <button
          type="button"
          className={`set-tool${activeTool === 'outro' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('outro')}
          title="Outro"
          aria-pressed={activeTool === 'outro'}
        >
          <span className="set-tool-label">Outro</span>
        </button>
        <button
          type="button"
          className={`set-tool${activeTool === 'comment' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('comment')}
          title="Kommentar"
          aria-pressed={activeTool === 'comment'}
        >
          <span className="set-tool-label">Kommentar</span>
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
              <button
                type="button"
                className="set-key set-key--apply"
                onClick={onToolApply}
                disabled={toolApplyDisabled}
                title="Akkord an Cursor einfuegen"
              >
                <Check size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {(activeTool === 'comment' || isSection) && (
        <div className="set-sub-row">
          <div className="set-sub-row-line">
            <input
              type="text"
              className="set-note-input"
              value={toolText}
              onChange={(e) => setToolText(e.target.value)}
              placeholder={
                activeTool === 'comment'
                  ? 'Kommentartext…'
                  : SECTION_PLACEHOLDER[activeTool]
              }
              autoFocus
            />
            <button
              type="button"
              className="set-note-clear"
              onClick={clearToolText}
              disabled={toolText.length === 0}
              title="Text leeren"
            >
              <X size={14} />
            </button>
            <button
              type="button"
              className="set-tool-apply-btn"
              onClick={onToolApply}
              disabled={toolApplyDisabled}
              title={
                activeTool === 'comment'
                  ? 'Kommentar an Cursor einfuegen'
                  : 'Selektion wrappen (oder Template am Cursor einfuegen)'
              }
            >
              <Check size={16} />
              <span>
                {activeTool === 'comment' ? 'Einfuegen' : 'Wrappen'}
              </span>
            </button>
          </div>
          <div className="set-sub-row-line set-format-hint-row">
            <span className="set-format-hint">{TOOL_HINT[activeTool]}</span>
          </div>
        </div>
      )}
    </div>
  )
}
