import { isValidChord } from './chordValidation'
import { isValidVocalToken } from './vocalValidation'

export interface ChordPositionEntry {
  line: number
  col: number
  chord: string
}

export interface PreservedVocalMark {
  line: number
  col: number
  token: string
}

export interface ParsedChordPositions {
  /** Original text with all `[chord]` and `{v:token}` markers stripped out. */
  text: string
  chords: ChordPositionEntry[]
  /** Vocal marks stripped from the text — re-inserted at save time so
   *  chord-editing does not drop them. */
  preservedVocals: PreservedVocalMark[]
}

/**
 * Parse both `[chord]` and `{v:token}` markers out of a ChordPro body.
 *
 * Returns the cleaned text plus the marks we're editing (chords) and the
 * vocals we want to preserve across a round-trip. Positions refer to the
 * cleaned text.
 */
export function parseChordPositions(body: string): ParsedChordPositions {
  const hasTrailingNewline = body.endsWith('\n')
  const trimmed = hasTrailingNewline ? body.slice(0, -1) : body
  const lines = trimmed.split('\n')

  const chords: ChordPositionEntry[] = []
  const preservedVocals: PreservedVocalMark[] = []
  const cleanLines: string[] = []

  // Match either `[chord]` or `{v:xxx}`, in source order.
  const markerRe = /\[([^\]]+)\]|\{v:([^{}]+)\}/g

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex]
    let cleanLine = ''
    let cursor = 0
    markerRe.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = markerRe.exec(rawLine)) !== null) {
      cleanLine += rawLine.slice(cursor, match.index)
      const cToken = match[1]
      const vToken = match[2]
      if (cToken !== undefined) {
        const chord = cToken.trim()
        if (isValidChord(chord)) {
          chords.push({ line: lineIndex, col: cleanLine.length, chord })
        } else {
          cleanLine += match[0]
        }
      } else if (vToken !== undefined) {
        const token = vToken.trim()
        if (isValidVocalToken(token)) {
          preservedVocals.push({ line: lineIndex, col: cleanLine.length, token })
        } else {
          cleanLine += match[0]
        }
      }
      cursor = match.index + match[0].length
    }
    cleanLine += rawLine.slice(cursor)
    cleanLines.push(cleanLine)
  }

  const text = cleanLines.join('\n') + (hasTrailingNewline ? '\n' : '')
  return { text, chords, preservedVocals }
}
