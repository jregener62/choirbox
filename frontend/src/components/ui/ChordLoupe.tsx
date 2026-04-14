import './ChordLoupe.css'

interface ChordLoupeProps {
  /** Viewport x-coordinate of the finger/pointer (center of loupe horizontally). */
  x: number
  /** Viewport y-coordinate of the finger/pointer (loupe is positioned above this). */
  y: number
  /** Line text the chord is anchored to. */
  lineText: string
  /** Current target column (0-based index into lineText). */
  col: number
  /** Chord name being moved. */
  chord: string
}

const WINDOW = 7

/**
 * iOS-style magnifier that appears while a chord is being dragged along a
 * text line. Shows the chord on top and a zoomed slice of the line with
 * the target character highlighted.
 */
export function ChordLoupe({ x, y, lineText, col, chord }: ChordLoupeProps) {
  const half = Math.floor(WINDOW / 2)
  const start = Math.max(0, col - half)
  const end = Math.min(lineText.length, start + WINDOW)
  const slice = lineText.slice(start, end)
  const targetOffset = col - start

  const chars = [...slice]
  // Pad the end so the target indicator has room past the last character
  while (chars.length < WINDOW) chars.push(' ')

  return (
    <div
      className="chord-loupe"
      style={{ left: x, top: y - 90 }}
      role="presentation"
      aria-hidden
    >
      <div className="chord-loupe-chord">{chord}</div>
      <div className="chord-loupe-row">
        {chars.map((ch, i) => (
          <span
            key={i}
            className={
              'chord-loupe-char' +
              (i === targetOffset ? ' chord-loupe-char--target' : '')
            }
          >
            {ch === ' ' ? '\u00A0' : ch}
          </span>
        ))}
      </div>
    </div>
  )
}
