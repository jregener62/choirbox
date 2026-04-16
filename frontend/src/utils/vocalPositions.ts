import { isValidVocalToken } from './vocalValidation'
import { isValidChord } from './chordValidation'

export interface VocalMarkEntry {
  line: number
  col: number
  token: string
}

export interface PreservedChord {
  line: number
  col: number
  chord: string
}

export interface ParsedVocalPositions {
  /** Original text with all `{v:token}` and `[chord]` markers stripped out. */
  text: string
  marks: VocalMarkEntry[]
  /** Chord markers stripped from the text — re-inserted at save time so
   *  vocal-editing does not drop them. */
  preservedChords: PreservedChord[]
}

/**
 * Parse both `{v:token}` and `[chord]` markers out of a ChordPro body.
 *
 * Returns the cleaned text (both markup kinds removed) plus the marks
 * we're editing (vocals) and the chords we want to preserve across a
 * round-trip. Positions refer to the cleaned text.
 *
 * Markers are processed in source order, so two markers at the same
 * source position produce two entries at the same cleaned-text col.
 */
export function parseVocalPositions(body: string): ParsedVocalPositions {
  const hasTrailingNewline = body.endsWith('\n')
  const trimmed = hasTrailingNewline ? body.slice(0, -1) : body
  const lines = trimmed.split('\n')

  const marks: VocalMarkEntry[] = []
  const preservedChords: PreservedChord[] = []
  const cleanLines: string[] = []

  // Match either `{v:xxx}` or `[chord]`, in source order.
  const markerRe = /\{v:([^{}]+)\}|\[([^\]]+)\]/g

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const rawLine = lines[lineIndex]
    let cleanLine = ''
    let cursor = 0
    markerRe.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = markerRe.exec(rawLine)) !== null) {
      cleanLine += rawLine.slice(cursor, match.index)
      const vToken = match[1]
      const cToken = match[2]
      if (vToken !== undefined) {
        const token = vToken.trim()
        if (isValidVocalToken(token)) {
          marks.push({ line: lineIndex, col: cleanLine.length, token })
        } else {
          cleanLine += match[0]
        }
      } else if (cToken !== undefined) {
        const chord = cToken.trim()
        if (isValidChord(chord)) {
          preservedChords.push({ line: lineIndex, col: cleanLine.length, chord })
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
  return { text, marks, preservedChords }
}
