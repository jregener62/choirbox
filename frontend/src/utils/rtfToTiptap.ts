/**
 * Konvertiert `ParsedRtf` (Output von parseRtf) in ein Tiptap-JSON-Dokument.
 *
 * Mapping:
 *   - Jede Soft-Line-Break-getrennte Zeile (\n aus \line / U+2028) wird
 *     zu einem eigenen Tiptap-Paragraph. Grund: Tiptap-Block-Befehle wie
 *     `toggleHeading` operieren immer auf dem umschliessenden Node — wenn
 *     mehrere Zeilen ueber `hardBreak` im selben Paragraph liegen, wuerde
 *     das gesamte Konstrukt zur Ueberschrift gemacht.
 *   - Zeile, die `### Titel` matcht → heading-Node (level 1-6)
 *   - andere Zeilen → paragraph mit inline text-Nodes
 *   - Run-Format b/i/u/s/bg → Tiptap marks
 *
 * Foreground-Farben, Fontsizes etc. gehen im MVP verloren.
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
  if (f.bg) marks.push({ type: 'highlight', attrs: { color: f.bg } })
  return marks
}

function textNode(text: string, marks: TiptapMark[]): TiptapNode {
  const node: TiptapNode = { type: 'text', text }
  if (marks.length > 0) node.marks = marks
  return node
}

/** Splittet Runs an `\n` in unabhaengige Zeilen — jede Zeile behaelt die
 *  Format-Infos der Runs, die sie ueberlappt. Leere Zeilen werden bewusst
 *  erhalten, damit Leerzeilen im Import nicht verschluckt werden. */
function splitRunsIntoLines(runs: RtfRun[]): RtfRun[][] {
  const lines: RtfRun[][] = [[]]
  for (const run of runs) {
    if (!run.text.includes('\n')) {
      if (run.text.length > 0) lines[lines.length - 1].push(run)
      continue
    }
    const parts = run.text.split('\n')
    if (parts[0].length > 0) {
      lines[lines.length - 1].push({ text: parts[0], format: run.format })
    }
    for (let i = 1; i < parts.length; i++) {
      lines.push([])
      if (parts[i].length > 0) {
        lines[lines.length - 1].push({ text: parts[i], format: run.format })
      }
    }
  }
  return lines
}

function lineToTiptapNode(lineRuns: RtfRun[]): TiptapNode {
  const lineText = lineRuns.map((r) => r.text).join('')
  const heading = detectSectionHeading(lineText)
  if (heading) {
    const level = Math.min(Math.max(heading.level, 1), 6)
    return {
      type: 'heading',
      attrs: { level },
      content: [{ type: 'text', text: heading.title }],
    }
  }
  const inline: TiptapNode[] = []
  for (const run of lineRuns) {
    const marks = marksFromFormat(run.format)
    if (run.text.length > 0) inline.push(textNode(run.text, marks))
  }
  const node: TiptapNode = { type: 'paragraph' }
  if (inline.length > 0) node.content = inline
  return node
}

export function rtfToTiptap(parsed: ParsedRtf): TiptapDoc {
  const content: TiptapNode[] = []
  for (const para of parsed.paragraphs) {
    if (para.pageBreak) {
      content.push({ type: 'pageBreak' })
      continue
    }
    if (para.runs.length === 0) {
      content.push({ type: 'paragraph' })
      continue
    }
    for (const lineRuns of splitRunsIntoLines(para.runs)) {
      content.push(lineToTiptapNode(lineRuns))
    }
  }
  // Ein komplett leeres Dokument waere fuer Tiptap ungueltig — mindestens
  // ein leerer paragraph muss drin sein.
  if (content.length === 0) content.push({ type: 'paragraph' })
  return { type: 'doc', content }
}
