import { describe, expect, it } from 'vitest'
import { transposeChord, transposeKey, shouldUseFlats, getTranspositionLabel } from '@/utils/chordTransposer'

describe('transposeChord', () => {
  it('returns the chord unchanged for 0 semitones', () => {
    expect(transposeChord('C', 0)).toBe('C')
    expect(transposeChord('F#m7', 0)).toBe('F#m7')
  })

  it('transposes basic major chords up', () => {
    expect(transposeChord('C', 2)).toBe('D')
    expect(transposeChord('C', 7)).toBe('G')
    expect(transposeChord('C', 12)).toBe('C')  // wraps within octave
  })

  it('transposes basic minor chords up', () => {
    expect(transposeChord('Am', 2)).toBe('Bm')
    expect(transposeChord('Em', 5)).toBe('Am')
  })

  it('transposes down (negative semitones)', () => {
    expect(transposeChord('D', -2)).toBe('C')
    expect(transposeChord('G', -7)).toBe('C')
  })

  it('preserves chord suffixes (maj7, sus4, etc.)', () => {
    expect(transposeChord('Cmaj7', 2)).toBe('Dmaj7')
    expect(transposeChord('Dsus4', 2)).toBe('Esus4')
    expect(transposeChord('F#dim', 1)).toBe('Gdim')
    expect(transposeChord('Bb7', 2)).toBe('C7')
  })

  it('transposes sharp roots', () => {
    expect(transposeChord('F#', 1)).toBe('G')
    expect(transposeChord('C#m', 2)).toBe('D#m')  // sharp scale by default
  })

  it('transposes flat roots', () => {
    expect(transposeChord('Bb', 2)).toBe('C')
    expect(transposeChord('Eb', 2, true)).toBe('F')
  })

  it('uses flat scale when flats=true', () => {
    expect(transposeChord('C', 1, true)).toBe('Db')
    expect(transposeChord('C', 6, true)).toBe('Gb')
    // sharp scale by default
    expect(transposeChord('C', 1, false)).toBe('C#')
  })

  it('handles slash chords (bass note)', () => {
    expect(transposeChord('Am/G', 2)).toBe('Bm/A')
    expect(transposeChord('C/E', 2)).toBe('D/F#')
    expect(transposeChord('G/B', -5)).toBe('D/F#')
  })

  it('returns input untouched for non-chord strings', () => {
    expect(transposeChord('foo', 2)).toBe('foo')
    expect(transposeChord('', 2)).toBe('')
  })
})

describe('transposeKey', () => {
  it('is an alias for transposeChord', () => {
    expect(transposeKey('Am', 3)).toBe(transposeChord('Am', 3))
    expect(transposeKey('Bb', -2)).toBe(transposeChord('Bb', -2))
  })
})

describe('shouldUseFlats', () => {
  it('returns false for empty list', () => {
    expect(shouldUseFlats([])).toBe(false)
  })

  it('returns true when any chord has a flat', () => {
    expect(shouldUseFlats(['Bb', 'C', 'F'])).toBe(true)
    expect(shouldUseFlats(['Eb', 'Gm'])).toBe(true)
  })

  it('returns false for sharp-only chords', () => {
    expect(shouldUseFlats(['C', 'F#m', 'G'])).toBe(false)
  })

  it('does not confuse a leading "B" with "b"', () => {
    expect(shouldUseFlats(['B', 'F#m'])).toBe(false)
  })
})

describe('getTranspositionLabel', () => {
  it('shows the original key for 0 semitones', () => {
    expect(getTranspositionLabel('C', 0)).toBe('Original (C)')
  })

  it('shows arrow notation for non-zero', () => {
    expect(getTranspositionLabel('C', 2)).toBe('C → D (+2)')
    expect(getTranspositionLabel('E', -3)).toBe('E → C# (-3)')
  })
})
