import { describe, expect, it } from 'vitest'
import { insertAtOffset, wrapLinesAsSection } from '@/utils/chordProEdit'

describe('insertAtOffset', () => {
  it('inserts a snippet at the given offset', () => {
    const r = insertAtOffset('Hello World', 5, ' there')
    expect(r.text).toBe('Hello there World')
    expect(r.caret).toBe(5 + ' there'.length)
  })

  it('places the caret before the end when caretOffsetFromEnd is set', () => {
    const r = insertAtOffset('abc', 0, '[[  ]]', 3)
    // Snippet = "[[  ]]" (6 chars), caret should be 3 before the end
    expect(r.caret).toBe(0 + 6 - 3)
    expect(r.text).toBe('[[  ]]abc')
  })

  it('clamps offset to the string bounds', () => {
    const a = insertAtOffset('abc', -1, 'X')
    expect(a.text).toBe('Xabc')
    const b = insertAtOffset('abc', 999, 'Y')
    expect(b.text).toBe('abcY')
  })
})

describe('wrapLinesAsSection — without selection', () => {
  it('inserts an empty template with caret between the directives', () => {
    const r = wrapLinesAsSection('Der Mond', 3, 3, 'verse', 'Strophe 1')
    expect(r.text).toBe('Der{start_of_verse: Strophe 1}\n\n{end_of_verse} Mond')
    // caret: offset 3 + startDir.length + 1 (for \n)
    expect(r.caret).toBe(3 + '{start_of_verse: Strophe 1}'.length + 1)
  })

  it('works without a label', () => {
    const r = wrapLinesAsSection('', 0, 0, 'chorus', '')
    expect(r.text).toBe('{start_of_chorus}\n\n{end_of_chorus}')
  })
})

describe('wrapLinesAsSection — with selection', () => {
  it('wraps full lines around the selection', () => {
    const text = 'Line A\nDer Mond\nDie Sterne\nLine C'
    // Select "Der Mond\nDie Sterne" (lines 1..2)
    const start = text.indexOf('Der')
    const end = text.indexOf('\nLine C')  // right before the newline before Line C
    const r = wrapLinesAsSection(text, start, end, 'verse', 'Strophe 1')
    expect(r.text).toBe(
      [
        'Line A',
        '{start_of_verse: Strophe 1}',
        'Der Mond',
        'Die Sterne',
        '{end_of_verse}',
        'Line C',
      ].join('\n'),
    )
    // Caret should be at end of {end_of_verse} line
    const expectedCaret = r.text.indexOf('{end_of_verse}') + '{end_of_verse}'.length
    expect(r.caret).toBe(expectedCaret)
  })

  it('expands a single-line partial selection to the whole line', () => {
    const text = 'Line A\nDer Mond ist aufgegangen\nLine C'
    const start = text.indexOf('Mond')
    const end = text.indexOf('aufgegangen')
    const r = wrapLinesAsSection(text, start, end, 'chorus', 'Ref')
    expect(r.text).toBe(
      [
        'Line A',
        '{start_of_chorus: Ref}',
        'Der Mond ist aufgegangen',
        '{end_of_chorus}',
        'Line C',
      ].join('\n'),
    )
  })

  it('handles selection ending exactly at a line break', () => {
    const text = 'A\nB\nC'
    // Select "B\n" — selection ends at start of line "C"
    const r = wrapLinesAsSection(text, 2, 4, 'bridge', '')
    // Expected: B is wrapped, not B+C
    expect(r.text).toBe(
      [
        'A',
        '{start_of_bridge}',
        'B',
        '{end_of_bridge}',
        'C',
      ].join('\n'),
    )
  })

  it('handles a reversed selection (end before start)', () => {
    const text = 'A\nB\nC'
    const r = wrapLinesAsSection(text, 4, 2, 'intro', '')
    // Same result as if start<end
    expect(r.text).toBe('A\n{start_of_intro}\nB\n{end_of_intro}\nC')
  })
})
