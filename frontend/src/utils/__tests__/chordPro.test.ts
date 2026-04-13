import { describe, expect, it } from 'vitest'
import {
  isChordPro,
  parseChordPro,
  parseChordSheet,
  serializeToChordPro,
  ensureChordPro,
} from '@/utils/chordPro'

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

describe('isChordPro', () => {
  it('detects directives', () => {
    expect(isChordPro('{title: Foo}')).toBe(true)
    expect(isChordPro('{key: G}')).toBe(true)
    expect(isChordPro('{start_of_verse}')).toBe(true)
    expect(isChordPro('{sov}')).toBe(true)
  })

  it('detects inline chord brackets when surrounded by text', () => {
    expect(isChordPro('A[G]mazing grace')).toBe(true)
    expect(isChordPro('hello [Am] world')).toBe(true)
  })

  it('detects multiple brackets on a single line', () => {
    expect(isChordPro('[C]hello [G]world')).toBe(true)
  })

  it('does NOT detect plain section headers as ChordPro', () => {
    expect(isChordPro('[Verse 1]')).toBe(false)
    expect(isChordPro('[Chorus]')).toBe(false)
  })

  it('does NOT detect Ultimate Guitar style as ChordPro', () => {
    const plain = `[Verse 1]
   C       G
Hello world`
    expect(isChordPro(plain)).toBe(false)
  })

  it('detects ChordPro even mixed with plain section headers', () => {
    const mixed = `[Verse 1]
[C]Hello [G]world`
    expect(isChordPro(mixed)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// ChordPro parser
// ---------------------------------------------------------------------------

describe('parseChordPro', () => {
  it('extracts {key:} as detected_key', () => {
    const r = parseChordPro('{key: Am}\n[Am]hello')
    expect(r.detected_key).toBe('Am')
  })

  it('parses inline chord+lyrics into clean text + col positions', () => {
    const r = parseChordPro('A[C]mazing [G]grace')
    expect(r.sections).toHaveLength(1)
    const line = r.sections[0].lines[0]
    expect(line.text).toBe('Amazing grace')
    expect(line.chords).toEqual([
      { chord: 'C', col: 1 },   // before "m" of "Amazing"
      { chord: 'G', col: 8 },   // before "g" of "grace"
    ])
  })

  it('skips hash-prefixed comment lines', () => {
    const r = parseChordPro('# top comment\n[C]hello\n# another\n[G]world')
    const texts = r.sections.flatMap((s) => s.lines.map((l) => l.text))
    expect(texts).toEqual(['hello', 'world'])
  })

  it('extracts inline {c:...} as annotations (does not appear as literal)', () => {
    const r = parseChordPro("[C]you've got a [G]friend {c:4x}")
    const line = r.sections[0].lines[0]
    expect(line.annotations).toEqual(['4x'])
    expect(line.text).not.toContain('{c:')
    expect(line.text).not.toContain('4x')
    expect(line.chords.map((c) => c.chord)).toEqual(['C', 'G'])
  })

  it('marks {comment:} lines as isComment', () => {
    const r = parseChordPro('{c: 4x}\n[C]hello')
    const first = r.sections[0].lines[0]
    expect(first.text).toBe('4x')
    expect(first.isComment).toBe(true)
  })

  it('skips empty {c:}, {t:}, {st:}', () => {
    const r = parseChordPro('{t:}\n{st:}\n{c:}\n[C]hello')
    expect(r.sections[0].lines).toEqual([{ text: 'hello', chords: [{ chord: 'C', col: 0 }] }])
  })

  it('skips empty [] and bar-separator [|] [||] tokens', () => {
    const r = parseChordPro('A[|]mazing [C] [] [||]grace[G]')
    const line = r.sections[0].lines[0]
    expect(line.chords.map((c) => c.chord)).toEqual(['C', 'G'])
    expect(line.text).toContain('Amazing')
    expect(line.text).toContain('grace')
  })

  it('puts {sot}...{eot} content into a tab section without chord parsing', () => {
    const r = parseChordPro('{sot}\ne|--[C]--0--|\n{eot}')
    const tabSection = r.sections.find((s) => s.type === 'tab')
    expect(tabSection).toBeDefined()
    // The bracketed content inside a tab block must NOT be parsed as a chord
    expect(tabSection!.lines[0].text).toBe('e|--[C]--0--|')
    expect(tabSection!.lines[0].chords).toEqual([])
  })

  it('supports generic start_of_/end_of_ directives (ChordPro 6)', () => {
    const text = `{start_of_intro}
[C][G]
{end_of_intro}
{start_of_solo: Solo 1}
[Am]
{end_of_solo}`
    const r = parseChordPro(text)
    expect(r.sections.map((s) => s.type)).toEqual(['intro', 'solo'])
    expect(r.sections[0].label).toBe('[Intro]')
    expect(r.sections[1].label).toBe('[Solo 1]')
  })

  it('accepts uppercase-M major chord shorthand (FM7, CMaj7)', () => {
    const r = parseChordPro('[FM7][G][Am]')
    const line = r.sections[0].lines[0]
    expect(line.chords.map((c) => c.chord)).toEqual(['FM7', 'G', 'Am'])
    expect(line.text.trim()).toBe('')
  })

  it('pads instrumental-only chord lines so chords do not stack', () => {
    // Without padding, cols would be 0,1,2,3 and all chords render on top.
    const r = parseChordPro('[Em] [D/F#] [G] [C]')
    const line = r.sections[0].lines[0]
    const cols = line.chords.map((c) => c.col)
    // Each chord must start strictly after the previous chord ends.
    for (let i = 1; i < line.chords.length; i++) {
      const prev = line.chords[i - 1]
      expect(cols[i]).toBeGreaterThan(prev.col + prev.chord.length - 1)
    }
    expect(line.chords.map((c) => c.chord)).toEqual(['Em', 'D/F#', 'G', 'C'])
  })

  it('routes start_of_verse / end_of_verse into a verse section', () => {
    const text = `{start_of_verse: Verse 1}
[C]hello
{end_of_verse}`
    const r = parseChordPro(text)
    expect(r.sections[0].type).toBe('verse')
    expect(r.sections[0].label).toBe('[Verse 1]')
  })

  it('handles short directive aliases (sov, eov, soc, eoc)', () => {
    const text = `{sov: V1}
[C]hello
{eov}
{soc: Chorus}
[G]world
{eoc}`
    const r = parseChordPro(text)
    expect(r.sections.map((s) => s.type)).toEqual(['verse', 'chorus'])
  })

  it('falls back to plain [Section] headers when present', () => {
    const text = `[Verse]
[C]hello`
    const r = parseChordPro(text)
    expect(r.sections[0].label).toBe('[Verse]')
    expect(r.sections[0].type).toBe('verse')
  })

  it('renders {comment:} as a label-less plain line', () => {
    const text = `{sov: V1}
{c: 2x repeat}
[C]hello
{eov}`
    const r = parseChordPro(text)
    const lines = r.sections[0].lines
    expect(lines[0]).toEqual({ text: '2x repeat', chords: [], isComment: true })
  })
})

// ---------------------------------------------------------------------------
// Unified entry: parseChordSheet (auto-detect)
// ---------------------------------------------------------------------------

describe('parseChordSheet', () => {
  it('routes ChordPro input through parseChordPro', () => {
    const r = parseChordSheet('[Am]Hello [G]world')
    expect(r.sections[0].lines[0].text).toBe('Hello world')
    expect(r.sections[0].lines[0].chords.map((c) => c.chord)).toEqual(['Am', 'G'])
  })

  it('routes plain Ultimate Guitar input through parseChordText', () => {
    const r = parseChordSheet(`[Verse]
   Am      G
Hello world`)
    expect(r.sections[0].lines[0].text).toBe('Hello world')
    expect(r.sections[0].lines[0].chords.map((c) => c.chord)).toEqual(['Am', 'G'])
  })
})

// ---------------------------------------------------------------------------
// Serializer + ensureChordPro round-trip
// ---------------------------------------------------------------------------

describe('serializeToChordPro', () => {
  it('emits {title:} and {key:} when provided', () => {
    const parsed = {
      sections: [],
      all_chords: [],
      detected_key: 'C',
      key_confidence: 1,
    }
    const out = serializeToChordPro(parsed, { title: 'Test' })
    expect(out).toContain('{title: Test}')
    expect(out).toContain('{key: C}')
  })

  it('wraps verse sections with start_of_verse / end_of_verse', () => {
    const parsed = {
      sections: [
        {
          type: 'verse',
          label: '[Verse 1]',
          lines: [{ text: 'hello', chords: [{ chord: 'C', col: 0 }] }],
        },
      ],
      all_chords: ['C'],
      detected_key: 'C',
      key_confidence: 1,
    }
    const out = serializeToChordPro(parsed, { title: 'X' })
    expect(out).toContain('{start_of_verse: Verse 1}')
    expect(out).toContain('[C]hello')
    expect(out).toContain('{end_of_verse}')
  })
})

describe('ensureChordPro', () => {
  it('returns ChordPro input unchanged (when title directive already present)', () => {
    const input = '{title: Foo}\n[C]hello'
    const out = ensureChordPro(input, 'Foo')
    expect(out.trimEnd()).toBe(input)
  })

  it('prepends {title:} to ChordPro input that lacks one', () => {
    const input = '[C]hello'
    const out = ensureChordPro(input, 'Foo')
    expect(out).toContain('{title: Foo}')
    expect(out).toContain('[C]hello')
  })

  it('converts plain Ultimate Guitar text to ChordPro', () => {
    const plain = `[Verse 1]
   C       G
Hello world`
    const out = ensureChordPro(plain, 'Demo')
    expect(out).toContain('{title: Demo}')
    expect(out).toContain('{start_of_verse: Verse 1}')
    expect(out).toContain('[C]')
    expect(out).toContain('[G]')
    expect(out).toContain('{end_of_verse}')
  })

  it('plain → ChordPro → parse round-trip preserves chord positions', () => {
    const plain = `[Verse]
   C       G
Hello world`
    const cp = ensureChordPro(plain, 'Round')
    const parsed = parseChordPro(cp)
    const line = parsed.sections[0].lines[0]
    expect(line.text).toBe('Hello world')
    expect(line.chords.map((c) => c.chord)).toEqual(['C', 'G'])
    // Columns must match the original Plain layout
    expect(line.chords[0].col).toBe(3)
    expect(line.chords[1].col).toBe(11)
  })
})
