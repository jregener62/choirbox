import { describe, expect, it } from 'vitest'
import {
  findOpenSectionAbove,
  shiftChordsInLine,
  shiftChordsByLines,
} from '@/utils/chordProEdit'

describe('shiftChordsInLine', () => {
  it('shifts columns past `fromCol` on the same line', () => {
    const chords = { '0:2': 'Dm', '0:6': 'G', '1:0': 'C' }
    expect(shiftChordsInLine(chords, 0, 5, 6)).toEqual({
      '0:2': 'Dm',
      '0:12': 'G',
      '1:0': 'C',
    })
  })

  it('returns the input unchanged when delta is 0', () => {
    const chords = { '0:1': 'C' }
    expect(shiftChordsInLine(chords, 0, 0, 0)).toBe(chords)
  })

  it('does not touch other lines', () => {
    const chords = { '0:2': 'Dm', '1:2': 'Em' }
    const out = shiftChordsInLine(chords, 0, 0, 3)
    expect(out).toEqual({ '0:5': 'Dm', '1:2': 'Em' })
  })
})

describe('shiftChordsByLines', () => {
  it('shifts lines >= fromLine by deltaLines', () => {
    const chords = { '0:0': 'A', '1:0': 'B', '2:0': 'C' }
    expect(shiftChordsByLines(chords, 1, 2)).toEqual({
      '0:0': 'A',
      '3:0': 'B',
      '4:0': 'C',
    })
  })

  it('leaves chords unchanged when delta is 0', () => {
    const chords = { '0:0': 'A' }
    expect(shiftChordsByLines(chords, 0, 0)).toBe(chords)
  })
})

describe('findOpenSectionAbove', () => {
  it('returns the open section type', () => {
    const lines = ['{start_of_verse: Strophe 1}', 'Der Mond', 'Sterne']
    expect(findOpenSectionAbove(lines, 3)).toBe('verse')
  })

  it('returns null if already closed', () => {
    const lines = ['{start_of_verse: A}', 'Text', '{end_of_verse}']
    expect(findOpenSectionAbove(lines, 3)).toBeNull()
  })

  it('returns null if no section directive present', () => {
    const lines = ['Plain line', 'Another']
    expect(findOpenSectionAbove(lines, 2)).toBeNull()
  })

  it('handles chorus and bridge', () => {
    expect(findOpenSectionAbove(['{start_of_chorus}'], 1)).toBe('chorus')
    expect(findOpenSectionAbove(['{start_of_bridge}'], 1)).toBe('bridge')
  })

  it('respects beforeLine boundary', () => {
    const lines = ['A', '{start_of_verse}', 'B']
    expect(findOpenSectionAbove(lines, 1)).toBeNull()
    expect(findOpenSectionAbove(lines, 2)).toBe('verse')
  })

  it('stops at the last end_of_X when a new start_of_X comes later', () => {
    const lines = [
      '{start_of_verse: A}',
      '{end_of_verse}',
      '{start_of_chorus}',
      'Refrain',
    ]
    expect(findOpenSectionAbove(lines, 4)).toBe('chorus')
  })
})
