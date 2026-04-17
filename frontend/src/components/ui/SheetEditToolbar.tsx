import { ArrowDown, ArrowUp, Bold, Delete, Italic, Minus, Strikethrough, Type, Underline, X } from 'lucide-react'
import { useChordInput } from '@/hooks/useChordInput'
import { useVocalInput } from '@/hooks/useVocalInput'
import { useTextFormat, type FormatFlag } from '@/hooks/useTextFormat'
import type { NotePosition } from '@/utils/vocalValidation'
import { isValidChord } from '@/utils/chordValidation'
import './SheetEditToolbar.css'

export type ActiveTool = 'chord' | 'beat' | 'note' | 'source' | null

const FORMAT_COLORS = [
  { key: 'default', label: 'Standard', value: 'currentColor' },
  { key: 'red',     label: 'Rot',      value: '#DC2626' },
  { key: 'green',   label: 'Grün',     value: '#16A34A' },
  { key: 'blue',    label: 'Blau',     value: '#2563EB' },
  { key: 'orange',  label: 'Orange',   value: '#EA580C' },
] as const

const FORMAT_BGS = [
  { key: 'default', label: 'Keine Markierung', value: 'transparent' },
  { key: 'yellow',  label: 'Gelb markieren',   value: 'rgba(250, 204, 21, 0.55)' },
  { key: 'red',     label: 'Rot markieren',    value: 'rgba(248, 113, 113, 0.45)' },
] as const

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

  const noteText = useVocalInput((s) => s.noteText)
  const notePos = useVocalInput((s) => s.notePosition)
  const setNoteText = useVocalInput((s) => s.setNoteText)
  const setNotePos = useVocalInput((s) => s.setNotePosition)
  const clearNoteText = useVocalInput((s) => s.clearNoteText)

  const formatSelection = useTextFormat((s) => s.selection)
  const formats = useTextFormat((s) => s.formats)
  const formatMode = useTextFormat((s) => s.formatMode)
  const setFormatMode = useTextFormat((s) => s.setFormatMode)
  const toggleFormatFlag = useTextFormat((s) => s.toggleFlag)
  const setFormatColor = useTextFormat((s) => s.setColor)
  const setFormatBg = useTextFormat((s) => s.setBg)
  const formatDisabled = !formatMode || formatSelection == null
  const flagActive = (flag: FormatFlag) => {
    if (!formatSelection) return false
    for (let col = formatSelection.start; col <= formatSelection.end; col++) {
      if (!formats[`${formatSelection.line}:${col}`]?.[flag]) return false
    }
    return true
  }
  const pickUniform = (prop: 'color' | 'bg'): string | null => {
    if (!formatSelection) return ''
    let first: string | undefined
    let init = false
    for (let col = formatSelection.start; col <= formatSelection.end; col++) {
      const c = formats[`${formatSelection.line}:${col}`]?.[prop]
      if (!init) { first = c; init = true }
      else if (c !== first) return null
    }
    return first ?? ''
  }
  const activeColor = pickUniform('color')
  const activeBg = pickUniform('bg')

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
          className={`set-tool set-tool--beat${activeTool === 'beat' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('beat')}
          title="Taktanfang (Zählzeit 1)"
          aria-pressed={activeTool === 'beat'}
        >
          <span className="set-tool-label">Taktanfang</span>
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

        <button
          type="button"
          className={`set-tool set-tool--source${activeTool === 'source' ? ' set-tool--active' : ''}`}
          onClick={() => toggle('source')}
          title="Text / Quelltext bearbeiten"
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

      {activeTool === 'note' && (
        <div className="set-sub-row">
          <div className="set-sub-row-line">
            <div className="set-note-pos" role="group" aria-label="Kommentar-Position">
              {([['t', 'Über der Zeile', ArrowUp], ['i', 'Inline', Minus], ['b', 'Unter der Zeile', ArrowDown]] as const).map(([pos, title, Icon]) => (
                <button
                  key={pos}
                  type="button"
                  className={`set-note-pos-btn set-note-pos-btn--${pos}${notePos === pos ? ' set-note-pos-btn--active' : ''}`}
                  onClick={() => setNotePos(pos as NotePosition)}
                  title={title}
                  aria-pressed={notePos === pos}
                >
                  <span className="set-note-pos-char">a</span>
                  <Icon size={12} />
                </button>
              ))}
            </div>
            <input
              type="text"
              className={`set-note-input set-note-input--${notePos}`}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Kommentar eingeben, dann Zeichen antippen"
              autoFocus
            />
            <button type="button" className="set-note-clear" onClick={clearNoteText} disabled={noteText.length === 0} title="Text leeren">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {activeTool === null && (
        <div className="set-sub-row">
          <div className="set-sub-row-line">
            <button
              type="button"
              className={`set-format-toggle${formatMode ? ' set-format-toggle--active' : ''}`}
              onClick={() => setFormatMode(!formatMode)}
              title={formatMode ? 'Formatierungen ausblenden' : 'Formatierungen bearbeiten'}
              aria-pressed={formatMode}
            >
              <Type size={16} />
            </button>
            {formatMode && (
              <>
                <div className="set-format-group" role="group" aria-label="Textformatierung">
                  {([['b', 'Fett', Bold], ['i', 'Kursiv', Italic], ['u', 'Unterstrichen', Underline], ['s', 'Durchgestrichen', Strikethrough]] as const).map(([flag, title, Icon]) => (
                    <button
                      key={flag}
                      type="button"
                      className="set-format-btn"
                      title={title}
                      aria-pressed={flagActive(flag)}
                      disabled={formatDisabled}
                      onClick={() => toggleFormatFlag(flag)}
                    >
                      <Icon size={16} />
                    </button>
                  ))}
                </div>
                <div className="set-format-colors" role="group" aria-label="Textfarbe">
                  {FORMAT_COLORS.map((c) => {
                    const isActive = activeColor === (c.key === 'default' ? '' : c.key)
                    return (
                      <button
                        key={c.key}
                        type="button"
                        className={`set-format-swatch set-format-swatch--${c.key}`}
                        style={{ '--swatch-color': c.value } as React.CSSProperties}
                        title={c.label}
                        aria-label={c.label}
                        aria-pressed={isActive}
                        disabled={formatDisabled}
                        onClick={() => setFormatColor(c.key === 'default' ? undefined : c.key)}
                      />
                    )
                  })}
                </div>
                <div className="set-format-colors set-format-colors--bg" role="group" aria-label="Textmarker">
                  {FORMAT_BGS.map((c) => {
                    const isActive = activeBg === (c.key === 'default' ? '' : c.key)
                    return (
                      <button
                        key={c.key}
                        type="button"
                        className={`set-format-swatch set-format-swatch--bg-${c.key}`}
                        style={{ '--swatch-color': c.value } as React.CSSProperties}
                        title={c.label}
                        aria-label={c.label}
                        aria-pressed={isActive}
                        disabled={formatDisabled}
                        onClick={() => setFormatBg(c.key === 'default' ? undefined : c.key)}
                      />
                    )
                  })}
                </div>
              </>
            )}
          </div>
          <div className="set-sub-row-line set-format-hint-row">
            <span className="set-format-hint">
              {!formatMode
                ? 'Formatierung einschalten, um Text zu markieren'
                : formatSelection == null
                  ? 'Text markieren, dann Stil oder Farbe antippen'
                  : 'Auswahl aktiv — Stil oder Farbe antippen'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
