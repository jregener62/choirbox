import { describe, expect, it } from 'vitest'
import {
  findCommentMatches,
  isCommentOnlyLine,
  detectSectionHeading,
  detectBarLead,
  splitBarLead,
  splitByCommentMarkers,
  splitInlineMarkers,
} from '@/utils/markers'

describe('findCommentMatches', () => {
  it('finds a single inline comment', () => {
    const r = findCommentMatches('Intro [[ ruhig ]] Vers 1')
    expect(r).toHaveLength(1)
    expect(r[0].text).toBe('ruhig')
    expect(r[0].start).toBe(6)
  })

  it('finds multiple comments on the same line', () => {
    const r = findCommentMatches('[[ p ]] erst dann [[ f ]]')
    expect(r).toHaveLength(2)
    expect(r.map((x) => x.text)).toEqual(['p', 'f'])
  })

  it('returns empty for text without markers', () => {
    expect(findCommentMatches('normaler Text')).toEqual([])
  })

  it('trims whitespace inside the marker', () => {
    expect(findCommentMatches('[[   viel Luft   ]]')[0].text).toBe('viel Luft')
  })
})

describe('isCommentOnlyLine', () => {
  it('true for exactly one comment, nothing else', () => {
    expect(isCommentOnlyLine('[[ ruhig beginnen ]]')).toBe(true)
    expect(isCommentOnlyLine('   [[ xyz ]]  ')).toBe(true)
  })
  it('false when other text surrounds', () => {
    expect(isCommentOnlyLine('prefix [[ xyz ]]')).toBe(false)
    expect(isCommentOnlyLine('[[ xyz ]] trailing')).toBe(false)
  })
  it('false for two comments', () => {
    expect(isCommentOnlyLine('[[ a ]] [[ b ]]')).toBe(false)
  })
})

describe('detectSectionHeading', () => {
  it('recognises ### Title as level-3 heading', () => {
    expect(detectSectionHeading('### Strophe 1')).toEqual({ level: 3, title: 'Strophe 1' })
  })
  it('supports levels 1..6', () => {
    expect(detectSectionHeading('# Big')?.level).toBe(1)
    expect(detectSectionHeading('###### Small')?.level).toBe(6)
  })
  it('returns null for plain text', () => {
    expect(detectSectionHeading('Der Mond ist aufgegangen')).toBeNull()
  })
  it('accepts leading whitespace', () => {
    expect(detectSectionHeading('  ### Refrain')).toEqual({ level: 3, title: 'Refrain' })
  })
  it('trims title whitespace', () => {
    expect(detectSectionHeading('### Sopran   ')?.title).toBe('Sopran')
  })
  it('returns null if title contains a [[ comment marker', () => {
    expect(detectSectionHeading('### Refrain [[ piano ]]')).toBeNull()
  })
  it('returns null if title contains a | bar-lead marker', () => {
    expect(detectSectionHeading('### Refrain | Takt 1')).toBeNull()
  })
})

describe('detectBarLead / splitBarLead', () => {
  it('true for "| text"', () => {
    expect(detectBarLead('| Der Mond')).toBe(true)
    expect(splitBarLead('| Der Mond')?.rest).toBe('Der Mond')
  })
  it('preserves indent', () => {
    expect(splitBarLead('  | abc')).toEqual({ indent: '  ', rest: 'abc' })
  })
  it('false without trailing whitespace', () => {
    expect(detectBarLead('|abc')).toBe(false)
  })
  it('false for text without pipe', () => {
    expect(detectBarLead('Der Mond')).toBe(false)
  })
})

describe('splitByCommentMarkers', () => {
  it('splits into text + comment + text', () => {
    const spans = splitByCommentMarkers('vor [[ ruhig ]] nach')
    expect(spans).toEqual([
      { kind: 'text', text: 'vor ' },
      { kind: 'comment', text: 'ruhig' },
      { kind: 'text', text: ' nach' },
    ])
  })
  it('returns a single text span when no markers', () => {
    expect(splitByCommentMarkers('plain')).toEqual([{ kind: 'text', text: 'plain' }])
  })
  it('handles comment at line start', () => {
    const spans = splitByCommentMarkers('[[ x ]] rest')
    expect(spans[0]).toEqual({ kind: 'comment', text: 'x' })
    expect(spans[1]).toEqual({ kind: 'text', text: ' rest' })
  })
  it('handles comment at line end', () => {
    const spans = splitByCommentMarkers('prefix [[ y ]]')
    expect(spans[0]).toEqual({ kind: 'text', text: 'prefix ' })
    expect(spans[1]).toEqual({ kind: 'comment', text: 'y' })
  })
})

describe('splitInlineMarkers (comments + bar-initials)', () => {
  it('detects a bar marker at the start of the line', () => {
    expect(splitInlineMarkers('| Der Mond')).toEqual([
      { kind: 'bar-initial', text: 'D' },
      { kind: 'text', text: 'er Mond' },
    ])
  })

  it('detects a bar marker mid-line', () => {
    expect(splitInlineMarkers('Der Mond | ist aufgegangen')).toEqual([
      { kind: 'text', text: 'Der Mond ' },
      { kind: 'bar-initial', text: 'i' },
      { kind: 'text', text: 'st aufgegangen' },
    ])
  })

  it('detects multiple bar markers in one line', () => {
    expect(splitInlineMarkers('| A B | C D | E')).toEqual([
      { kind: 'bar-initial', text: 'A' },
      { kind: 'text', text: ' B ' },
      { kind: 'bar-initial', text: 'C' },
      { kind: 'text', text: ' D ' },
      { kind: 'bar-initial', text: 'E' },
    ])
  })

  it('combines comments and bar markers', () => {
    expect(splitInlineMarkers('[[ p ]] | Der Mond')).toEqual([
      { kind: 'comment', text: 'p' },
      { kind: 'text', text: ' ' },
      { kind: 'bar-initial', text: 'D' },
      { kind: 'text', text: 'er Mond' },
    ])
  })

  it('does not treat bar markers inside [[ ]] comments', () => {
    expect(splitInlineMarkers('[[ | ist Inhalt ]]')).toEqual([
      { kind: 'comment', text: '| ist Inhalt' },
    ])
  })

  it('ignores | without trailing non-whitespace (trailing | at line end)', () => {
    expect(splitInlineMarkers('Der Mond |')).toEqual([
      { kind: 'text', text: 'Der Mond |' },
    ])
  })

  it('accepts | directly before the char (no space between)', () => {
    expect(splitInlineMarkers('Der |Mond')).toEqual([
      { kind: 'text', text: 'Der ' },
      { kind: 'bar-initial', text: 'M' },
      { kind: 'text', text: 'ond' },
    ])
  })

  it('accepts | mid-word without surrounding whitespace', () => {
    expect(splitInlineMarkers('aufge|gangen')).toEqual([
      { kind: 'text', text: 'aufge' },
      { kind: 'bar-initial', text: 'g' },
      { kind: 'text', text: 'angen' },
    ])
  })

  it('does not treat || as a bar marker', () => {
    expect(splitInlineMarkers('foo || bar')).toEqual([
      { kind: 'text', text: 'foo || bar' },
    ])
  })

  it('keeps plain text without any marker untouched', () => {
    expect(splitInlineMarkers('Der Mond ist aufgegangen')).toEqual([
      { kind: 'text', text: 'Der Mond ist aufgegangen' },
    ])
  })
})
