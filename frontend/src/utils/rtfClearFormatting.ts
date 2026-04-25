/**
 * Zaehlt und entfernt Formatierungen dokumentweit aus einem Tiptap-Editor.
 *
 * Unterstuetzte Typen:
 *   - Inline-Marks: bold, italic, underline, strike, highlight
 *   - Block-Knoten: heading (-> paragraph), pageBreak (-> entfernt)
 *   - Text-Patterns: comment ([[ ... ]]), barMarker (`| `), arrow (Melodie-Glyphen)
 *
 * Limitierung Text-Patterns: pro Text-Knoten — `[[ ... ]]`, das ueber mehrere
 * Text-Knoten mit unterschiedlichen Marks gespannt ist, wird nicht erkannt.
 * In der Praxis irrelevant, da Kommentare typischerweise unformatiert sind.
 */

import type { Editor } from '@tiptap/react'
import type { Node as PMNode, Mark } from '@tiptap/pm/model'

export type FormattingKind =
  | 'bold' | 'italic' | 'underline' | 'strike' | 'highlight'
  | 'heading' | 'pageBreak'
  | 'comment' | 'barMarker' | 'arrow'

export interface FormattingEntry {
  kind: FormattingKind
  label: string
  count: number
}

const ARROW_RE = /[/\\_~↖↑↗←→↙↓↘]/g
const COMMENT_RE = /\[\[\s*[\s\S]+?\s*\]\]/g
const BAR_MARKER_RE = /(?<!\|)\|(\s*)([^|\s])/g

const MARK_KINDS: ReadonlyArray<Extract<FormattingKind, 'bold' | 'italic' | 'underline' | 'strike' | 'highlight'>> =
  ['bold', 'italic', 'underline', 'strike', 'highlight']

const LABELS: Record<FormattingKind, string> = {
  bold: 'Fett',
  italic: 'Kursiv',
  underline: 'Unterstrichen',
  strike: 'Durchgestrichen',
  highlight: 'Markierungen',
  heading: 'Ueberschriften',
  pageBreak: 'Seitenumbrueche',
  comment: 'Kommentare',
  barMarker: 'Taktanfaenge',
  arrow: 'Pfeile',
}

const ORDER: FormattingKind[] = [
  'bold', 'italic', 'underline', 'strike', 'highlight',
  'heading', 'comment', 'barMarker', 'arrow', 'pageBreak',
]

/** Anzahl der Vorkommen pro Formatierungstyp im aktuellen Editor-Doc. */
export function countFormattings(editor: Editor): FormattingEntry[] {
  const counts: Record<FormattingKind, number> = {
    bold: 0, italic: 0, underline: 0, strike: 0, highlight: 0,
    heading: 0, pageBreak: 0,
    comment: 0, barMarker: 0, arrow: 0,
  }

  editor.state.doc.descendants((node: PMNode) => {
    if (node.type.name === 'heading') counts.heading++
    if (node.type.name === 'pageBreak') counts.pageBreak++
    if (node.isText && node.text) {
      for (const m of node.marks) {
        if ((MARK_KINDS as readonly string[]).includes(m.type.name)) {
          counts[m.type.name as keyof typeof counts]++
        }
      }
      const t = node.text
      counts.arrow += (t.match(ARROW_RE) || []).length
      counts.comment += (t.match(COMMENT_RE) || []).length
      counts.barMarker += [...t.matchAll(BAR_MARKER_RE)].length
    }
    return true
  })

  return ORDER.map((kind) => ({ kind, label: LABELS[kind], count: counts[kind] }))
}

/** Entfernt alle Vorkommen einer Formatierung aus dem Doc.
 *  Aenderungen sind via Tiptap-History (Strg+Z) ruecknehmbar. */
export function clearFormatting(editor: Editor, kind: FormattingKind): void {
  const { state, view } = editor
  const tr = state.tr
  const schema = state.schema

  if ((MARK_KINDS as readonly string[]).includes(kind)) {
    const markType = schema.marks[kind]
    if (markType) tr.removeMark(0, state.doc.content.size, markType)
  } else if (kind === 'heading') {
    const positions: number[] = []
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'heading') positions.push(pos)
    })
    for (const pos of positions.reverse()) {
      tr.setNodeMarkup(pos, schema.nodes.paragraph)
    }
  } else if (kind === 'pageBreak') {
    const ranges: Array<{ from: number; to: number }> = []
    state.doc.descendants((node, pos) => {
      if (node.type.name === 'pageBreak') {
        ranges.push({ from: pos, to: pos + node.nodeSize })
      }
    })
    for (const r of ranges.reverse()) tr.delete(r.from, r.to)
  } else {
    const replacements: Array<{ from: number; to: number; text: string; marks: readonly Mark[] }> = []
    state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      let newText: string
      if (kind === 'arrow') {
        newText = node.text.replace(ARROW_RE, '')
      } else if (kind === 'comment') {
        newText = node.text.replace(COMMENT_RE, '')
      } else {
        newText = node.text.replace(BAR_MARKER_RE, (_m, _ws, ch) => ch)
      }
      if (newText !== node.text) {
        replacements.push({ from: pos, to: pos + node.nodeSize, text: newText, marks: node.marks })
      }
    })
    for (const r of replacements.reverse()) {
      if (r.text.length === 0) {
        tr.delete(r.from, r.to)
      } else {
        tr.replaceWith(r.from, r.to, schema.text(r.text, r.marks))
      }
    }
  }

  if (tr.docChanged) {
    view.dispatch(tr)
  }
  view.focus()
}
