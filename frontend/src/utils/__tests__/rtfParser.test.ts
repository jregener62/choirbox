import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseRtf } from '@/utils/rtfParser'

const SAMPLES_DIR = join(__dirname, '..', '..', '..', '..', 'docs', 'samples')
const readSample = (name: string) => readFileSync(join(SAMPLES_DIR, name), 'utf-8')

describe('parseRtf: basics', () => {
  it('returns no paragraphs for empty input', () => {
    const r = parseRtf('')
    expect(r.paragraphs).toEqual([])
  })

  it('parses plain text with a single paragraph', () => {
    const r = parseRtf('{\\rtf1\\ansi Hello world\\par}')
    expect(r.paragraphs).toHaveLength(1)
    expect(r.paragraphs[0].runs).toHaveLength(1)
    expect(r.paragraphs[0].runs[0].text).toBe('Hello world')
  })

  it('splits multiple paragraphs on \\par', () => {
    const r = parseRtf('{\\rtf1\\ansi First\\par Second\\par}')
    expect(r.paragraphs).toHaveLength(2)
    expect(r.paragraphs[0].runs[0].text).toBe('First')
    expect(r.paragraphs[1].runs[0].text).toBe('Second')
  })
})

describe('parseRtf: character formatting', () => {
  it('marks bold runs', () => {
    const r = parseRtf('{\\rtf1\\ansi plain \\b bold\\b0  back\\par}')
    const runs = r.paragraphs[0].runs
    expect(runs.length).toBeGreaterThanOrEqual(2)
    const bold = runs.find((x) => x.format.b)
    expect(bold?.text).toBe('bold')
  })

  it('marks italic and underline runs', () => {
    const r = parseRtf('{\\rtf1 \\i italic\\i0  \\ul under\\ulnone\\par}')
    const italic = r.paragraphs[0].runs.find((x) => x.format.i)
    const under = r.paragraphs[0].runs.find((x) => x.format.u)
    expect(italic?.text).toBe('italic')
    expect(under?.text).toBe('under')
  })

  it('marks strike-through runs', () => {
    const r = parseRtf('{\\rtf1 \\strike gone\\strike0\\par}')
    const strike = r.paragraphs[0].runs.find((x) => x.format.s)
    expect(strike?.text).toBe('gone')
  })

  it('translates \\fs to point size (half-points)', () => {
    const r = parseRtf('{\\rtf1 \\fs28 big\\par}')
    expect(r.paragraphs[0].runs[0].format.fontSize).toBe(14)
  })
})

describe('parseRtf: color table', () => {
  it('parses colortbl entries with auto at index 0', () => {
    const rtf = '{\\rtf1{\\colortbl;\\red255\\green0\\blue0;\\red0\\green0\\blue255;}\\cf1 red\\cf2  blue\\par}'
    const r = parseRtf(rtf)
    expect(r.colorTable[0]).toBeNull()
    expect(r.colorTable[1]).toBe('#ff0000')
    expect(r.colorTable[2]).toBe('#0000ff')
    const red = r.paragraphs[0].runs.find((x) => x.format.color === '#ff0000')
    const blue = r.paragraphs[0].runs.find((x) => x.format.color === '#0000ff')
    expect(red?.text).toBe('red')
    expect(blue?.text).toBe(' blue')
  })

  it('applies \\highlight as background color', () => {
    const rtf = '{\\rtf1{\\colortbl;\\red255\\green255\\blue0;}\\highlight1 hi\\par}'
    const r = parseRtf(rtf)
    expect(r.paragraphs[0].runs[0].format.bg).toBe('#ffff00')
  })
})

describe('parseRtf: escapes and special chars', () => {
  it('decodes \\\'xx ANSI bytes (umlauts via cp1252)', () => {
    const r = parseRtf("{\\rtf1\\ansi wei\\'dfe\\par}")
    expect(r.paragraphs[0].runs[0].text).toBe('weiße')
  })

  it('decodes \\uN unicode and skips the ASCII fallback char', () => {
    const r = parseRtf('{\\rtf1\\ansi sch\\u246?n\\par}')
    expect(r.paragraphs[0].runs[0].text).toBe('schön')
  })

  it("decodes \\u with \\'xx fallback", () => {
    const r = parseRtf("{\\rtf1\\ansi sch\\u246\\'3fn\\par}")
    expect(r.paragraphs[0].runs[0].text).toBe('schön')
  })

  it('un-escapes \\\\  \\{  \\}', () => {
    const r = parseRtf('{\\rtf1 a\\\\b\\{c\\}d\\par}')
    expect(r.paragraphs[0].runs[0].text).toBe('a\\b{c}d')
  })

  it('renders \\endash and \\emdash', () => {
    const r = parseRtf('{\\rtf1 a\\endash b\\emdash c\\par}')
    expect(r.paragraphs[0].runs[0].text).toBe('a\u2013b\u2014c')
  })

  it('translates \\~ to non-breaking space', () => {
    const r = parseRtf('{\\rtf1 a\\~b\\par}')
    expect(r.paragraphs[0].runs[0].text).toBe('a\u00A0b')
  })
})

describe('parseRtf: TextEdit soft line breaks', () => {
  it('treats "\\<LF>" as a soft line break (newline inside paragraph)', () => {
    const rtf = '{\\rtf1\\ansi first\\\nsecond\\\nthird\\par}'
    const r = parseRtf(rtf)
    expect(r.paragraphs).toHaveLength(1)
    const text = r.paragraphs[0].runs.map((x) => x.text).join('')
    expect(text).toBe('first\nsecond\nthird')
  })

  it('handles the real TextEdit pattern: marker lines separated by \\<LF>', () => {
    const rtf = [
      '{\\rtf1\\ansi\\cocoartf2869',
      '\\f0\\fs24 ### Refrain\\',
      '\\',
      '| Takt 1\\',
      '\\',
      '[[ piano ]]}',
    ].join('\n')
    const r = parseRtf(rtf)
    const text = r.paragraphs.flatMap((p) => p.runs).map((x) => x.text).join('|')
    expect(text).toContain('### Refrain')
    expect(text).toContain('| Takt 1')
    expect(text).toContain('[[ piano ]]')
  })
})

describe('parseRtf: destinations & tolerance', () => {
  it('skips {\\*\\unknown ...} ignorable destinations', () => {
    const r = parseRtf('{\\rtf1 visible{\\*\\unknownstuff hidden content}still\\par}')
    const text = r.paragraphs[0].runs.map((x) => x.text).join('')
    expect(text).toBe('visiblestill')
  })

  it('skips stylesheet / info destinations', () => {
    const r = parseRtf('{\\rtf1{\\stylesheet{\\s1 Heading;}}{\\info{\\author X}}visible\\par}')
    const text = r.paragraphs[0].runs.map((x) => x.text).join('')
    expect(text).toBe('visible')
  })

  it('ignores unknown control words silently', () => {
    const r = parseRtf('{\\rtf1\\cocoartf2761\\pardirnatural hello\\par}')
    expect(r.paragraphs[0].runs[0].text).toBe('hello')
  })

  it('parses font table entries', () => {
    const r = parseRtf('{\\rtf1{\\fonttbl{\\f0\\fnil Helvetica;}{\\f1\\fnil Arial;}}Body\\par}')
    expect(r.fontTable[0]).toBe('Helvetica')
    expect(r.fontTable[1]).toBe('Arial')
  })
})

describe('parseRtf: real sample files', () => {
  it('parses A-Der Mond ist aufgegangen.rtf (minimal style)', () => {
    const rtf = readSample('A-Der Mond ist aufgegangen.rtf')
    const r = parseRtf(rtf)
    expect(r.paragraphs.length).toBeGreaterThan(5)
    const allText = r.paragraphs.flatMap((p) => p.runs).map((r) => r.text).join('')
    expect(allText).toContain('Der Mond ist aufgegangen')
    expect(allText).toContain('weiße')
    expect(allText).toContain('schön')
    expect(allText).toContain('[[ ruhig und getragen ]]')
    // Expect a bold run and a comment-colored run somewhere
    const runs = r.paragraphs.flatMap((p) => p.runs)
    expect(runs.some((x) => x.format.b)).toBe(true)
    expect(runs.some((x) => x.format.i)).toBe(true)
    expect(runs.some((x) => x.format.color)).toBe(true)
  })

  it('parses T-Der Mond ist aufgegangen.rtf (TextEdit / cocoartf style)', () => {
    const rtf = readSample('T-Der Mond ist aufgegangen.rtf')
    const r = parseRtf(rtf)
    const allText = r.paragraphs.flatMap((p) => p.runs).map((r) => r.text).join('')
    expect(allText).toContain('Der Mond ist aufgegangen')
    expect(allText).toContain('weiße')
    expect(allText).toContain('[[ ruhig und getragen ]]')
  })

  it('parses S-Der Mond ist aufgegangen.rtf (Word / verbose style)', () => {
    const rtf = readSample('S-Der Mond ist aufgegangen.rtf')
    const r = parseRtf(rtf)
    const allText = r.paragraphs.flatMap((p) => p.runs).map((r) => r.text).join('')
    expect(allText).toContain('Der Mond ist aufgegangen')
    expect(allText).toContain('weiße')   // \u223\'3f fallback
    expect(allText).toContain('schön')   // \u246\'3f fallback
    expect(allText).toContain('[[ Einsatz nach Orgelvorspiel, ruhig ]]')
    // Word-style {\stylesheet ...} must be fully skipped — never appear in text
    expect(allText).not.toContain('heading 1')
    expect(allText).not.toContain('Normal;')
  })
})

describe('parseRtf: scope', () => {
  it('restores formatting when a group closes', () => {
    const r = parseRtf('{\\rtf1 a{\\b bold}c\\par}')
    const runs = r.paragraphs[0].runs
    // Expect: "a" (plain), "bold" (bold), "c" (plain back)
    expect(runs.find((x) => x.text === 'bold')?.format.b).toBe(true)
    const tail = runs[runs.length - 1]
    expect(tail.text).toBe('c')
    expect(tail.format.b).toBeFalsy()
  })

  it('handles nested bold+italic', () => {
    const r = parseRtf('{\\rtf1 {\\b {\\i both}}plain\\par}')
    const both = r.paragraphs[0].runs.find((x) => x.text === 'both')
    expect(both?.format.b).toBe(true)
    expect(both?.format.i).toBe(true)
  })
})
