/**
 * Chord transposition utilities for the frontend.
 * Mirrors backend logic in chord_transposer.py.
 */

const SHARP_SCALE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT_SCALE = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']

const NOTE_TO_INDEX: Record<string, number> = {}
SHARP_SCALE.forEach((note, i) => { NOTE_TO_INDEX[note] = i })
FLAT_SCALE.forEach((note, i) => { NOTE_TO_INDEX[note] = i })

const CHORD_RE = /^([A-G][b#]?)(.*)$/

function useFlats(chords: string[]): boolean {
  return chords.some(c => c.includes('b') && c[0] !== 'b')
}

function transposeNote(note: string, semitones: number, flats: boolean): string {
  const idx = NOTE_TO_INDEX[note]
  if (idx === undefined) return note
  const newIdx = ((idx + semitones) % 12 + 12) % 12
  return flats ? FLAT_SCALE[newIdx] : SHARP_SCALE[newIdx]
}

export function transposeChord(chord: string, semitones: number, flats = false): string {
  if (semitones === 0) return chord
  const trimmed = chord.trim()
  if (!trimmed) return trimmed

  // Handle slash chords (e.g., Am/G)
  const slashIdx = trimmed.lastIndexOf('/')
  if (slashIdx > 0) {
    const mainPart = trimmed.substring(0, slashIdx)
    const bassNote = trimmed.substring(slashIdx + 1)
    // Only treat as slash chord if bass is a valid note
    if (/^[A-G][b#]?$/.test(bassNote)) {
      return `${transposeChord(mainPart, semitones, flats)}/${transposeNote(bassNote, semitones, flats)}`
    }
  }

  const match = trimmed.match(CHORD_RE)
  if (!match) return trimmed

  const root = match[1]
  const suffix = match[2]
  return `${transposeNote(root, semitones, flats)}${suffix}`
}

export function transposeKey(key: string, semitones: number): string {
  return transposeChord(key, semitones)
}

/**
 * Get display text for transposition: e.g., "E → G" or "Original (E)"
 */
export function getTranspositionLabel(originalKey: string, semitones: number): string {
  if (semitones === 0) return `Original (${originalKey})`
  const newKey = transposeKey(originalKey, semitones)
  const direction = semitones > 0 ? `+${semitones}` : `${semitones}`
  return `${originalKey} → ${newKey} (${direction})`
}

/**
 * Get all unique chords from parsed content and determine flat preference.
 */
export function shouldUseFlats(allChords: string[]): boolean {
  return useFlats(allChords)
}
