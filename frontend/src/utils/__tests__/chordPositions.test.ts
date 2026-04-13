import { describe, it, expect } from 'vitest'
import { parseChordPositions } from '../chordPositions'

describe('parseChordPositions', () => {
  it('returns clean text and empty chord list for plain text', () => {
    const { text, chords } = parseChordPositions('Hello world')
    expect(text).toBe('Hello world')
    expect(chords).toEqual([])
  })

  it('extracts single chord at start of line', () => {
    const { text, chords } = parseChordPositions('[C]Hello world')
    expect(text).toBe('Hello world')
    expect(chords).toEqual([{ line: 0, col: 0, chord: 'C' }])
  })

  it('extracts multiple chords with correct offsets in clean text', () => {
    const { text, chords } = parseChordPositions('[G]Amazing [C]grace, how [G]sweet')
    expect(text).toBe('Amazing grace, how sweet')
    expect(chords).toEqual([
      { line: 0, col: 0, chord: 'G' },
      { line: 0, col: 8, chord: 'C' },
      { line: 0, col: 19, chord: 'G' },
    ])
  })

  it('handles multiple lines', () => {
    const { text, chords } = parseChordPositions('[C]line one\nline two\nline [G]three')
    expect(text).toBe('line one\nline two\nline three')
    expect(chords).toEqual([
      { line: 0, col: 0, chord: 'C' },
      { line: 2, col: 5, chord: 'G' },
    ])
  })

  it('preserves trailing newline', () => {
    const { text } = parseChordPositions('[C]hello\n')
    expect(text).toBe('hello\n')
  })

  it('leaves non-chord brackets in place', () => {
    const { text, chords } = parseChordPositions('[Verse 1]\n[C]hello')
    expect(text).toBe('[Verse 1]\nhello')
    expect(chords).toEqual([{ line: 1, col: 0, chord: 'C' }])
  })

  it('handles chord at end of line', () => {
    const { text, chords } = parseChordPositions('end[F]')
    expect(text).toBe('end')
    expect(chords).toEqual([{ line: 0, col: 3, chord: 'F' }])
  })

  it('roundtrips with the server build logic for a typical song', () => {
    const body = '[G]Amazing [C]grace, how [G]sweet\n[D7]the sound that [G]saved'
    const { text, chords } = parseChordPositions(body)
    expect(text).toBe('Amazing grace, how sweet\nthe sound that saved')
    expect(chords).toHaveLength(5)
  })
})
