/**
 * Serialisiert ein Tiptap-JSON-Dokument zu einem minimalen RTF-String.
 *
 * Wir schreiben nur Kontrollwoerter, die unser eigener Parser liest:
 *   Struktur:    \par (Absatz), \line (Soft-Break)
 *   Character:   \b \i \ul \strike   (jeweils mit `\X0`/`\ulnone`)
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

function wrapWithMarks(text: string, marks?: TiptapMark[]): string {
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
    }
  }
  return open.join('') + esc + close.join('')
}

function serializeChildren(nodes: TiptapNode[] | undefined): string {
  if (!nodes) return ''
  return nodes.map(serializeNode).join('')
}

function serializeNode(node: TiptapNode): string {
  switch (node.type) {
    case 'text':
      return wrapWithMarks(node.text ?? '', node.marks)
    case 'hardBreak':
      return '\\line '
    case 'paragraph':
      return serializeChildren(node.content) + '\\par\n'
    case 'heading': {
      const lvl = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6)
      const prefix = '#'.repeat(lvl) + ' '
      return escapeRtfText(prefix) + serializeChildren(node.content) + '\\par\n'
    }
    case 'bulletList':
    case 'orderedList':
      // MVP: renders list items als einfache Absaetze, kein echtes Listen-Markup.
      return serializeChildren(node.content)
    case 'listItem':
      return serializeChildren(node.content)
  }
  return serializeChildren(node.content)
}

const RTF_HEADER =
  '{\\rtf1\\ansi\\ansicpg1252\\deff0\n' +
  '{\\fonttbl{\\f0\\fnil Helvetica;}}\n' +
  '\\fs24\n'

const RTF_FOOTER = '}'

export function serializeTiptapToRtf(doc: TiptapDoc): string {
  const body = serializeChildren(doc.content)
  return RTF_HEADER + body + RTF_FOOTER
}
