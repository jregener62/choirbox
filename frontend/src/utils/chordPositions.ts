import { isValidChord } from './chordValidation'

export interface ChordPositionEntry {
  line: number
  col: number
  chord: string
}

export interface ParsedChordPositions {
  text: string
  chords: ChordPositionEntry[]
}

export function parseChordPositions(body: string): ParsedChordPositions {
  const hasTrailingNewline = body.endsWith('\n')
  const trimmed = hasTrailingNewline ? body.slice(0, -1) : body
  const lines = trimmed.split('\n')

  const chords: ChordPositionEntry[] = []
  const cleanLines: string[] = []

  const markerRe = /\[([^\]]+)\]/g

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex]
    let cleanLine = ''
    let cursor = 0
    markerRe.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = markerRe.exec(rawLine)) !== null) {
      cleanLine += rawLine.slice(cursor, match.index)
      const token = match[1]
      if (isValidChord(token)) {
        chords.push({ line: lineIndex, col: cleanLine.length, chord: token })
      } else {
        cleanLine += match[0]
      }
      cursor = match.index + match[0].length
    }
    cleanLine += rawLine.slice(cursor)
    cleanLines.push(cleanLine)
  }

  const text = cleanLines.join('\n') + (hasTrailingNewline ? '\n' : '')
  return { text, chords }
}
