/**
 * Pure Helper fuer ChordPro-Source-Manipulation. Werden vom useChordInput-
 * Store (insertCommentAt / insertSectionBefore) und isoliert in Unit-Tests
 * verwendet.
 */

export type SectionType =
  | 'verse'
  | 'chorus'
  | 'bridge'
  | 'intro'
  | 'interlude'
  | 'outro'

function cellKey(line: number, col: number): string {
  return `${line}:${col}`
}

/** Verschiebt alle Chord-Positionen auf `line` mit `col >= fromCol` um
 *  `delta` Spalten nach rechts. */
export function shiftChordsInLine(
  chords: Record<string, string>,
  line: number,
  fromCol: number,
  delta: number,
): Record<string, string> {
  if (delta === 0) return chords
  const next: Record<string, string> = {}
  for (const [key, chord] of Object.entries(chords)) {
    const [l, c] = key.split(':').map(Number)
    if (l === line && c >= fromCol) next[cellKey(l, c + delta)] = chord
    else next[key] = chord
  }
  return next
}

/** Verschiebt alle Chord-Positionen ab `fromLine` um `deltaLines` Zeilen nach
 *  unten (neue Zeilen wurden davor eingefuegt). */
export function shiftChordsByLines(
  chords: Record<string, string>,
  fromLine: number,
  deltaLines: number,
): Record<string, string> {
  if (deltaLines === 0) return chords
  const next: Record<string, string> = {}
  for (const [key, chord] of Object.entries(chords)) {
    const [l, c] = key.split(':').map(Number)
    if (l >= fromLine) next[cellKey(l + deltaLines, c)] = chord
    else next[key] = chord
  }
  return next
}

const SECTION_TYPES: readonly SectionType[] = [
  'verse', 'chorus', 'bridge', 'intro', 'interlude', 'outro',
]

const SECTION_ALTERNATION = SECTION_TYPES.join('|')
const END_RE = new RegExp(`^\\{\\s*end_of_(${SECTION_ALTERNATION})\\s*\\}`, 'i')
const START_RE = new RegExp(
  `^\\{\\s*start_of_(${SECTION_ALTERNATION})(?:\\s*:[^}]*)?\\s*\\}`,
  'i',
)

/** Sucht rueckwaerts ab `beforeLine` (exklusiv) nach einem offenen
 *  `{start_of_<type>}` (ohne zugehoeriges `{end_of_<type>}` davor).
 *  Gibt den offenen Typ zurueck oder null. */
export function findOpenSectionAbove(
  lines: string[],
  beforeLine: number,
): SectionType | null {
  for (let i = beforeLine - 1; i >= 0; i--) {
    const raw = lines[i].trim()
    if (END_RE.test(raw)) return null
    const startMatch = START_RE.exec(raw)
    if (startMatch) {
      const t = startMatch[1].toLowerCase() as SectionType
      return SECTION_TYPES.includes(t) ? t : null
    }
  }
  return null
}
