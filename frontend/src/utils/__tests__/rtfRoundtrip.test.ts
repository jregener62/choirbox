import { describe, expect, it } from 'vitest'
import { parseRtf } from '@/utils/rtfParser'
import { serializeTiptapToRtf } from '@/utils/rtfSerializer'
import { rtfToTiptap } from '@/utils/rtfToTiptap'

describe('serializeTiptapToRtf', () => {
  it('serializes a plain paragraph', () => {
    const out = serializeTiptapToRtf({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hallo' }] }],
    })
    expect(out).toContain('Hallo')
    expect(out).toContain('\\par')
  })

  it('wraps bold marks', () => {
    const out = serializeTiptapToRtf({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }],
      }],
    })
    expect(out).toContain('\\b ')
    expect(out).toContain('bold')
    expect(out).toContain('\\b0 ')
  })

  it('escapes backslash, braces, umlauts', () => {
    const out = serializeTiptapToRtf({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: '\\{a}ß' }],
      }],
    })
    expect(out).toContain('\\\\')
    expect(out).toContain('\\{')
    expect(out).toContain('\\}')
    // ß = U+00DF = 223
    expect(out).toContain('\\u223?')
  })

  it('serializes heading as ### prefix', () => {
    const out = serializeTiptapToRtf({
      type: 'doc',
      content: [{
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Refrain' }],
      }],
    })
    expect(out).toContain('## Refrain')
  })
})

describe('rtfToTiptap', () => {
  it('converts a plain RTF paragraph into a Tiptap paragraph', () => {
    const parsed = parseRtf('{\\rtf1\\ansi Hallo Welt\\par}')
    const doc = rtfToTiptap(parsed)
    expect(doc.content?.[0]).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hallo Welt' }],
    })
  })

  it('translates b/i/u/strike formatting to Tiptap marks', () => {
    const parsed = parseRtf('{\\rtf1 \\b bold\\b0  \\i ital\\i0  \\ul under\\ulnone\\par}')
    const doc = rtfToTiptap(parsed)
    const inline = doc.content![0].content ?? []
    const bold = inline.find((n) => n.text === 'bold')
    const ital = inline.find((n) => n.text === 'ital')
    const under = inline.find((n) => n.text === 'under')
    expect(bold?.marks?.[0].type).toBe('bold')
    expect(ital?.marks?.[0].type).toBe('italic')
    expect(under?.marks?.[0].type).toBe('underline')
  })

  it('promotes `### Title` paragraphs to heading nodes', () => {
    const parsed = parseRtf('{\\rtf1 ### Refrain\\par}')
    const doc = rtfToTiptap(parsed)
    expect(doc.content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Refrain' }],
    })
  })

  it('splits \\line-separated lines into independent paragraphs', () => {
    // Jede Zeile wird zum eigenen Paragraph, damit Tiptap-Block-Befehle
    // (toggleHeading etc.) nur die markierte Zeile betreffen.
    const parsed = parseRtf('{\\rtf1 A\\line B\\par}')
    const doc = rtfToTiptap(parsed)
    expect(doc.content).toHaveLength(2)
    expect(doc.content?.[0]).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'A' }],
    })
    expect(doc.content?.[1]).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'B' }],
    })
  })

  it('promotes only the matching line to heading, not the whole paragraph', () => {
    // Mehrzeiliger Paragraph mit "### Title" irgendwo in der Mitte —
    // nur diese Zeile wird zum heading, die anderen bleiben paragraphs.
    const parsed = parseRtf('{\\rtf1 intro\\line ### Chorus\\line lyric line\\par}')
    const doc = rtfToTiptap(parsed)
    expect(doc.content).toHaveLength(3)
    expect(doc.content?.[0]).toMatchObject({ type: 'paragraph' })
    expect(doc.content?.[1]).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Chorus' }],
    })
    expect(doc.content?.[2]).toMatchObject({ type: 'paragraph' })
  })

  it('ensures doc has at least one paragraph for empty input', () => {
    const doc = rtfToTiptap({ paragraphs: [], colorTable: [null], fontTable: {} })
    expect(doc.content).toEqual([{ type: 'paragraph' }])
  })
})

describe('RTF round-trip (Tiptap → RTF → parseRtf → Tiptap)', () => {
  it('preserves plain text + bold + heading', () => {
    const input = {
      type: 'doc' as const,
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Strophe 1' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Der ' },
            { type: 'text', text: 'Mond', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' ist aufgegangen' },
          ],
        },
      ],
    }
    const rtf = serializeTiptapToRtf(input)
    const parsed = parseRtf(rtf)
    const doc = rtfToTiptap(parsed)

    expect(doc.content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 3 },
    })
    expect((doc.content?.[0].content?.[0] as { text: string }).text).toBe('Strophe 1')
    const inline = doc.content?.[1].content ?? []
    const bold = inline.find((n) => n.text === 'Mond')
    expect(bold?.marks?.[0].type).toBe('bold')
  })

  it('preserves highlight color through the round-trip', () => {
    const input = {
      type: 'doc' as const,
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'plain ' },
          {
            type: 'text',
            text: 'marked',
            marks: [{ type: 'highlight', attrs: { color: '#fef3c7' } }],
          },
          { type: 'text', text: ' tail' },
        ],
      }],
    }
    const rtf = serializeTiptapToRtf(input)
    // Sollte Colortable + Cocoa-kompatible \cb/\chcbpat Trio enthalten
    expect(rtf).toContain('\\colortbl;')
    expect(rtf).toContain('\\red254\\green243\\blue199')
    expect(rtf).toContain('\\cb1')
    expect(rtf).toContain('\\chcbpat1')
    expect(rtf).toContain('\\highlight1')
    expect(rtf).toContain('\\highlight0')

    const parsed = parseRtf(rtf)
    const doc = rtfToTiptap(parsed)
    const inline = doc.content?.[0].content ?? []
    const marked = inline.find((n) => n.text === 'marked')
    expect(marked?.marks?.find((m) => m.type === 'highlight')?.attrs?.color).toBe('#fef3c7')
  })

  it('recovers highlight color after TextEdit drops \\highlight (only \\cb survives)', () => {
    // Simuliert das echte TextEdit-Roundtrip-Verhalten: unser Serializer
    // schreibt \cb\chcbpat\highlight, TextEdit laesst beim Speichern nur
    // \cb\chcbpat uebrig. Der Parser muss das weiterhin als Hintergrundfarbe
    // lesen — sonst geht die Farbe bei jedem Edit in TextEdit verloren.
    const input = {
      type: 'doc' as const,
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'before ' },
          {
            type: 'text',
            text: 'marked',
            marks: [{ type: 'highlight', attrs: { color: '#fef3c7' } }],
          },
          { type: 'text', text: ' after' },
        ],
      }],
    }
    const rtf = serializeTiptapToRtf(input)
    // Simulate TextEdit-Save: entfernt \highlight<n>, laesst \cb<n>\chcbpat<n>
    const afterTextEdit = rtf.replace(/\\highlight\d+\s?/g, '')
    const parsed = parseRtf(afterTextEdit)
    const doc = rtfToTiptap(parsed)
    const inline = doc.content?.[0].content ?? []
    const marked = inline.find((n) => n.text === 'marked')
    expect(marked?.marks?.find((m) => m.type === 'highlight')?.attrs?.color).toBe('#fef3c7')
  })

  it('preserves umlauts through the round-trip', () => {
    const input = {
      type: 'doc' as const,
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'weiße Flöße' }],
      }],
    }
    const rtf = serializeTiptapToRtf(input)
    const parsed = parseRtf(rtf)
    const text = parsed.paragraphs[0].runs.map((r) => r.text).join('')
    expect(text).toBe('weiße Flöße')
  })
})
