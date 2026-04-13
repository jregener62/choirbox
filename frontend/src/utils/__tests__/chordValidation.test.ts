import { describe, it, expect } from 'vitest'
import { isValidChord } from '../chordValidation'

describe('isValidChord', () => {
  it.each([
    'C', 'D', 'Am', 'G7', 'Cmaj7', 'F#m', 'Bb',
    'Dsus4', 'Edim', 'Gaug', 'C/G', 'D/F#', 'Am7', 'Cmaj9',
  ])('accepts valid chord "%s"', (token) => {
    expect(isValidChord(token)).toBe(true)
  })

  it.each([
    '', ' ', 'H', 'cmaj7', 'C##', 'Cbb', 'C/', '/C',
    'C-7', 'hello', '7', '#C',
  ])('rejects invalid chord "%s"', (token) => {
    expect(isValidChord(token)).toBe(false)
  })
})
