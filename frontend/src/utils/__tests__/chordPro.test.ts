import { describe, expect, it } from 'vitest'
import {
  isChordPro,
  parseChordPro,
  parseChordSheet,
  serializeToChordPro,
  ensureChordPro,
  normalizeChordProDirectives,
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

  // ---- Metadata ----
  it('extracts all standard metadata directives', () => {
    const text = `{title: Hallelujah}
{subtitle: A Song}
{artist: Leonard Cohen}
{composer: Cohen}
{lyricist: Cohen}
{copyright: 1984 Sony}
{album: Various Positions}
{year: 1984}
{key: C}
{time: 4/4}
{tempo: 72}
{duration: 4:39}
{capo: 2}

[C]now I've heard there was a secret [Am]chord`
    const r = parseChordPro(text)
    expect(r.metadata).toBeDefined()
    expect(r.metadata!.title).toBe('Hallelujah')
    expect(r.metadata!.subtitle).toBe('A Song')
    expect(r.metadata!.artist).toBe('Leonard Cohen')
    expect(r.metadata!.composer).toBe('Cohen')
    expect(r.metadata!.lyricist).toBe('Cohen')
    expect(r.metadata!.copyright).toBe('1984 Sony')
    expect(r.metadata!.album).toBe('Various Positions')
    expect(r.metadata!.year).toBe('1984')
    expect(r.metadata!.key).toBe('C')
    expect(r.metadata!.time).toBe('4/4')
    expect(r.metadata!.tempo).toBe('72')
    expect(r.metadata!.duration).toBe('4:39')
    expect(r.metadata!.capo).toBe('2')
    expect(r.detected_key).toBe('C')
  })

  it('accepts short aliases {t:}, {st:}, {su:}', () => {
    const r = parseChordPro('{t: Foo}\n{st: Bar}\n{su: Baz}\n[C]x')
    expect(r.metadata!.title).toBe('Foo')
    expect(r.metadata!.subtitle).toBe('Baz') // {su} overwrites {st}
  })

  it('does NOT set metadata field when directive value is empty', () => {
    const r = parseChordPro('{title:}\n{artist:}\n[C]x')
    expect(r.metadata).toBeUndefined()
  })

  it('collects generic {meta:} entries', () => {
    const r = parseChordPro('{meta: genre Folk}\n{meta: genre Rock}\n{meta: mood happy}\n[C]x')
    expect(r.metadata!.meta).toEqual({
      genre: ['Folk', 'Rock'],
      mood: ['happy'],
    })
  })

  // ---- Comment styles ----
  it('differentiates {c}, {ci}, {cb} via commentStyle', () => {
    const r = parseChordPro('{c: plain}\n{ci: italic}\n{cb: box}\n[C]x')
    const lines = r.sections[0].lines
    // Plain comment has no commentStyle (default implied)
    expect(lines[0]).toEqual({ text: 'plain', chords: [], isComment: true })
    expect(lines[1]).toMatchObject({ text: 'italic', isComment: true, commentStyle: 'italic' })
    expect(lines[2]).toMatchObject({ text: 'box', isComment: true, commentStyle: 'box' })
  })

  // ---- Chorus reference ----
  it('treats {chorus} as a chorus-reference section', () => {
    const text = `{soc}
[G]real chorus
{eoc}
[C]verse
{chorus}`
    const r = parseChordPro(text)
    const refSection = r.sections.find((s) => s.type === 'chorus-ref')
    expect(refSection).toBeDefined()
    expect(refSection!.label).toBe('[Refrain]')
    expect(refSection!.lines[0].isComment).toBe(true)
  })

  it('respects custom label for {chorus: Chorus 1}', () => {
    const r = parseChordPro('{chorus: Chorus 1}')
    const refSection = r.sections.find((s) => s.type === 'chorus-ref')
    expect(refSection!.label).toBe('[Chorus 1]')
  })

  // ---- Grid block ----
  it('puts {sog}...{eog} content into a grid section without chord parsing', () => {
    const r = parseChordPro('{sog}\n| [C] . . . | [G] . . . |\n{eog}')
    const grid = r.sections.find((s) => s.type === 'grid')
    expect(grid).toBeDefined()
    // Bracketed content inside a grid block is NOT parsed as chord
    expect(grid!.lines[0].text).toBe('| [C] . . . | [G] . . . |')
    expect(grid!.lines[0].chords).toEqual([])
  })

  // ---- Multi-directive lines ----
  it('attaches {comment:} on the same line as {title:} as a title note', () => {
    const r = parseChordPro('{title: Sonnenbadewanne} {comment: 3. Bund}\n[C]x')
    expect(r.metadata!.title).toBe('Sonnenbadewanne')
    expect(r.metadata!.titleNotes).toEqual(['3. Bund'])
    // The comment must NOT appear as a standalone comment line.
    const commentLines = r.sections
      .flatMap((s) => s.lines)
      .filter((l) => l.isComment && l.text === '3. Bund')
    expect(commentLines).toHaveLength(0)
  })

  it('keeps {comment:} on its own line as a standalone comment line', () => {
    const r = parseChordPro('{title: Song}\n{comment: footnote}\n[C]x')
    expect(r.metadata!.titleNotes).toBeUndefined()
    const commentLines = r.sections
      .flatMap((s) => s.lines)
      .filter((l) => l.isComment && l.text === 'footnote')
    expect(commentLines).toHaveLength(1)
  })

  it('does NOT let {title:} value cross a closing brace', () => {
    // Regression for: {title: A} {comment: B} previously swallowed the } and
    // stored title = "A} {comment: B"
    const r = parseChordPro('{title: A} {comment: B}')
    expect(r.metadata!.title).toBe('A')
  })

  // ---- Directive names with spaces ----
  it('accepts directive names with spaces and normalizes to underscores', () => {
    const text = `{start of verse: Vers 1}
[F#m7]Ich verdunkel
{end of verse: Vers 1}`
    const r = parseChordPro(text)
    expect(r.sections[0].type).toBe('verse')
    expect(r.sections[0].label).toBe('[Vers 1]')
  })

  // ---- Silently ignored directives (appearance / chord diagrams) ----
  it('silently ignores appearance directives (font/size/color/columns/new_page)', () => {
    const text = `{textfont: serif}
{textsize: 14}
{textcolour: red}
{chordfont: mono}
{chordsize: 12}
{chordcolour: blue}
{columns: 2}
{column_break}
{new_page}
{new_physical_page}
{define: Am frets 0 2 2 1 0 0}
{chord: Am}
[C]hello [Am]world`
    const r = parseChordPro(text)
    // Only the lyric line should have rendered
    const flatLines = r.sections.flatMap((s) => s.lines)
    expect(flatLines).toHaveLength(1)
    expect(flatLines[0].text).toBe('hello world')
    expect(flatLines[0].chords.map((c) => c.chord)).toEqual(['C', 'Am'])
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

describe('normalizeChordProDirectives', () => {
  it('converts spaces in directive names to underscores', () => {
    expect(normalizeChordProDirectives('{start of verse: Vers 1}'))
      .toBe('{start_of_verse: Vers 1}')
    expect(normalizeChordProDirectives('{end of verse}')).toBe('{end_of_verse}')
  })

  it('preserves values (no normalization inside the value)', () => {
    // Value contains spaces — must be kept as-is.
    expect(normalizeChordProDirectives('{title: Sonnenbadewanne Teil 2}'))
      .toBe('{title: Sonnenbadewanne Teil 2}')
  })

  it('leaves already-canonical directives untouched', () => {
    expect(normalizeChordProDirectives('{start_of_verse: V1}\n[C]x\n{end_of_verse}'))
      .toBe('{start_of_verse: V1}\n[C]x\n{end_of_verse}')
  })

  it('lower-cases directive names to the standard form', () => {
    expect(normalizeChordProDirectives('{Start Of Verse: V1}'))
      .toBe('{start_of_verse: V1}')
  })

  it('does not touch chord tokens [C]', () => {
    expect(normalizeChordProDirectives('[C]hello [Am]world'))
      .toBe('[C]hello [Am]world')
  })

  it('handles multiple directives on one line', () => {
    expect(normalizeChordProDirectives('{start of verse} {end of verse}'))
      .toBe('{start_of_verse} {end_of_verse}')
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
