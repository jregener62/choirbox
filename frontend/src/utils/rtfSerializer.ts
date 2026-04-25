/**
 * Serialisiert ein Tiptap-JSON-Dokument zu einem minimalen RTF-String.
 *
 * Wir schreiben nur Kontrollwoerter, die unser eigener Parser liest:
 *   Struktur:    \par (Absatz), \line (Soft-Break)
 *   Character:   \b \i \ul \strike   (jeweils mit `\X0`/`\ulnone`)
 *                \cb<n>\chcbpat<n>\highlight<n>   (Text-Hintergrundfarbe —
 *                Dreier-Kombi, damit TextEdit/cocoartf beim Roundtrip den
 *                `\cb<n>`-Teil erhaelt; `\highlight` allein wird verworfen)
 *   Escape:      \\ \{ \}
 *   Non-ASCII:   \uNNNN? (signed-16-bit, ? als ASCII-Fallback)
 *
 * Headings werden als Markdown-artige `### Titel`-Zeilen serialisiert —
 * konsistent mit der ChoirBox-Marker-Syntax, round-trip-sicher via parseRtf.
 */

export interface TiptapMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  marks?: TiptapMark[]
  text?: string
}

export interface TiptapDoc {
  type: 'doc'
  content?: TiptapNode[]
}

function escapeRtfText(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; ) {
    const code = s.codePointAt(i)!
    const ch = String.fromCodePoint(code)
    i += ch.length

    if (ch === '\\') { out += '\\\\'; continue }
    if (ch === '{')  { out += '\\{';  continue }
    if (ch === '}')  { out += '\\}';  continue }
    if (ch === '\n') { out += '\\line '; continue }

    if (code < 0x80) {
      out += ch
      continue
    }
    // RTF Unicode escape — signed 16-bit integer; chars outside BMP werden
    // auf den BMP-Fallback abgebildet (fuer unser RTF-Subset ausreichend).
    const clamped = code > 0xFFFF ? 0xFFFD : code
    const signed = clamped > 0x7FFF ? clamped - 0x10000 : clamped
    out += `\\u${signed}?`
  }
  return out
}

function normalizeHexColor(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]
  }
  return null
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

/** Sammelt alle Highlight-Farben aus dem Doc (stabile Reihenfolge = erstes Auftreten). */
function collectHighlightColors(doc: TiptapDoc): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const walk = (node: TiptapNode) => {
    if (node.marks) {
      for (const m of node.marks) {
        if (m.type === 'highlight' && typeof m.attrs?.color === 'string') {
          const hex = normalizeHexColor(m.attrs.color as string)
          if (hex && !seen.has(hex)) {
            seen.add(hex)
            out.push(hex)
          }
        }
      }
    }
    if (node.content) for (const c of node.content) walk(c)
  }
  for (const c of doc.content ?? []) walk(c)
  return out
}

function buildColorTable(colors: string[]): string {
  if (colors.length === 0) return ''
  // Index 0 ist reserviert fuer "auto"/default; explizite Farben starten bei 1.
  let out = '{\\colortbl;'
  for (const c of colors) {
    const { r, g, b } = hexToRgb(c)
    out += `\\red${r}\\green${g}\\blue${b};`
  }
  out += '}\n'
  return out
}

function wrapWithMarks(
  text: string,
  marks: TiptapMark[] | undefined,
  colorIndex: Map<string, number>,
): string {
  const esc = escapeRtfText(text)
  if (!marks || marks.length === 0) return esc
  const open: string[] = []
  const close: string[] = []
  for (const m of marks) {
    switch (m.type) {
      case 'bold':      open.push('\\b ');      close.unshift('\\b0 ');      break
      case 'italic':    open.push('\\i ');      close.unshift('\\i0 ');      break
      case 'underline': open.push('\\ul ');     close.unshift('\\ulnone ');  break
      case 'strike':    open.push('\\strike '); close.unshift('\\strike0 '); break
      case 'highlight': {
        const hex = typeof m.attrs?.color === 'string'
          ? normalizeHexColor(m.attrs.color as string)
          : null
        const idx = hex ? colorIndex.get(hex) : undefined
        if (idx !== undefined) {
          // \cb + \chcbpat sind die Cocoa/TextEdit-Konventionen fuer
          // character-background; \highlight ist die klassische Word-Form.
          // Alle drei schreiben, damit der Roundtrip durch TextEdit die
          // Hintergrundfarbe nicht verliert (TextEdit emittiert nur \cb
          // beim Speichern zurueck).
          open.push(`\\cb${idx}\\chcbpat${idx}\\highlight${idx} `)
          close.unshift('\\cb0\\chcbpat0\\highlight0 ')
        }
        break
      }
    }
  }
  return open.join('') + esc + close.join('')
}

function serializeNode(node: TiptapNode, colorIndex: Map<string, number>): string {
  switch (node.type) {
    case 'text':
      return wrapWithMarks(node.text ?? '', node.marks, colorIndex)
    case 'hardBreak':
      return '\\line '
    case 'pageBreak':
      return '\\page\n'
    case 'paragraph':
      return serializeChildren(node.content, colorIndex) + '\\par\n'
    case 'heading': {
      const lvl = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6)
      const prefix = '#'.repeat(lvl) + ' '
      return escapeRtfText(prefix) + serializeChildren(node.content, colorIndex) + '\\par\n'
    }
    case 'bulletList':
    case 'orderedList':
      // MVP: renders list items als einfache Absaetze, kein echtes Listen-Markup.
      return serializeChildren(node.content, colorIndex)
    case 'listItem':
      return serializeChildren(node.content, colorIndex)
  }
  return serializeChildren(node.content, colorIndex)
}

function serializeChildren(
  nodes: TiptapNode[] | undefined,
  colorIndex: Map<string, number>,
): string {
  if (!nodes) return ''
  return nodes.map((n) => serializeNode(n, colorIndex)).join('')
}

const RTF_HEADER_BASE =
  '{\\rtf1\\ansi\\ansicpg1252\\deff0\n' +
  '{\\fonttbl{\\f0\\fnil Helvetica;}}\n'

const RTF_FOOTER = '}'

export function serializeTiptapToRtf(doc: TiptapDoc): string {
  const colors = collectHighlightColors(doc)
  const colorIndex = new Map<string, number>()
  colors.forEach((c, i) => colorIndex.set(c, i + 1))

  const header = RTF_HEADER_BASE + buildColorTable(colors) + '\\fs24\n'
  const body = serializeChildren(doc.content, colorIndex)
  return header + body + RTF_FOOTER
}
