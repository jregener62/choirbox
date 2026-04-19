/**
 * Konvertiert `ParsedRtf` (Output von parseRtf) in ein Tiptap-JSON-Dokument.
 *
 * Mapping:
 *   - leerer Paragraph → leerer paragraph node
 *   - Paragraph, dessen Text einem `### Titel` entspricht → heading-Node
 *   - alle anderen Paragraphen → paragraph mit inline text-/hardBreak-Nodes
 *   - Run-Format b/i/u/s → Tiptap marks (bold, italic, underline, strike)
 *   - `\n` innerhalb eines Runs → hardBreak
 *
 * Farben, Background, Fontsizes etc. gehen im MVP verloren (Phase-3-Warnung).
 */

import type { ParsedRtf, RtfFormat, RtfRun } from './rtfParser'
import { detectSectionHeading } from './markers'
import type { TiptapDoc, TiptapMark, TiptapNode } from './rtfSerializer'

function marksFromFormat(f: RtfFormat): TiptapMark[] {
  const marks: TiptapMark[] = []
  if (f.b) marks.push({ type: 'bold' })
  if (f.i) marks.push({ type: 'italic' })
  if (f.u) marks.push({ type: 'underline' })
  if (f.s) marks.push({ type: 'strike' })
  return marks
}

function textNode(text: string, marks: TiptapMark[]): TiptapNode {
  const node: TiptapNode = { type: 'text', text }
  if (marks.length > 0) node.marks = marks
  return node
}

function runToInline(run: RtfRun): TiptapNode[] {
  const marks = marksFromFormat(run.format)
  const out: TiptapNode[] = []
  const parts = run.text.split('\n')
  parts.forEach((part, i) => {
    if (i > 0) out.push({ type: 'hardBreak' })
    if (part.length > 0) out.push(textNode(part, marks))
  })
  return out
}

export function rtfToTiptap(parsed: ParsedRtf): TiptapDoc {
  const content: TiptapNode[] = []
  for (const para of parsed.paragraphs) {
    if (para.runs.length === 0) {
      content.push({ type: 'paragraph' })
      continue
    }

    const fullText = para.runs.map((r) => r.text).join('')
    const heading = detectSectionHeading(fullText)
    if (heading) {
      const level = Math.min(Math.max(heading.level, 1), 6)
      content.push({
        type: 'heading',
        attrs: { level },
        content: [{ type: 'text', text: heading.title }],
      })
      continue
    }

    const inline: TiptapNode[] = []
    for (const run of para.runs) inline.push(...runToInline(run))
    const node: TiptapNode = { type: 'paragraph' }
    if (inline.length > 0) node.content = inline
    content.push(node)
  }
  // Ein komplett leeres Dokument waere fuer Tiptap ungueltig — mindestens
  // ein leerer paragraph muss drin sein.
  if (content.length === 0) content.push({ type: 'paragraph' })
  return { type: 'doc', content }
}
