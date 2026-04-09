import { describe, expect, it } from 'vitest'
import { parseChordText } from '@/utils/chordParser'

describe('parseChordText: section detection', () => {
  it('returns an empty result for empty input', () => {
    const r = parseChordText('')
    expect(r.sections).toEqual([])
    expect(r.all_chords).toEqual([])
  })

  it('detects [Verse] header and creates a verse section', () => {
    const text = `[Verse 1]
   C
Hello`
    const r = parseChordText(text)
    expect(r.sections).toHaveLength(1)
    expect(r.sections[0].type).toBe('verse')
    expect(r.sections[0].label).toBe('[Verse 1]')
  })

  it('classifies common section types', () => {
    const text = `[Chorus]
C
hello

[Bridge]
G
world

[Solo]
Am
solo here

[Outro]
F
bye`
    const r = parseChordText(text)
    expect(r.sections.map((s) => s.type)).toEqual(['chorus', 'bridge', 'solo', 'outro'])
  })
})

describe('parseChordText: chord-line / lyrics pairing', () => {
  it('pairs a chord line with the following lyrics', () => {
    const text = `[Verse]
   C       G
Hello world`
    const r = parseChordText(text)
    const line = r.sections[0].lines[0]
    expect(line.text).toBe('Hello world')
    expect(line.chords).toHaveLength(2)
    expect(line.chords[0].chord).toBe('C')
    expect(line.chords[1].chord).toBe('G')
  })

  it('records chord column positions', () => {
    const text = `[Verse]
   C       G
Hello world`
    const r = parseChordText(text)
    const line = r.sections[0].lines[0]
    expect(line.chords[0].col).toBe(3)   // "   C"
    expect(line.chords[1].col).toBe(11)  // "   C       G"
  })

  it('handles lyrics without chords', () => {
    const text = `[Verse]
just some lyrics`
    const r = parseChordText(text)
    const line = r.sections[0].lines[0]
    expect(line.text).toBe('just some lyrics')
    expect(line.chords).toEqual([])
  })

  it('treats a chord-only line (no lyrics after) as instrumental', () => {
    const text = `[Intro]
C G Am F`
    const r = parseChordText(text)
    const line = r.sections[0].lines[0]
    expect(line.text).toBe('')
    expect(line.chords.map((c) => c.chord)).toEqual(['C', 'G', 'Am', 'F'])
  })
})

describe('parseChordText: aggregate metadata', () => {
  it('collects all unique chords in order', () => {
    const text = `[Verse]
   C   G
Hello

[Chorus]
   Am  G   F
World`
    const r = parseChordText(text)
    expect(r.all_chords).toEqual(['C', 'G', 'Am', 'F'])
  })

  it('detects key from chord progression', () => {
    const text = `[Verse]
   Am
Hello
   F
world
   Am
again`
    const r = parseChordText(text)
    expect(r.detected_key).toBe('A')  // Am root is "A"
    expect(r.key_confidence).toBeGreaterThan(0)
  })

  it('returns C with 0 confidence for empty chord set', () => {
    const r = parseChordText('just text\nno chords here')
    expect(r.detected_key).toBe('C')
    expect(r.key_confidence).toBe(0)
  })
})
