/**
 * Gemeinsame Marker-Syntax fuer ChoirBox-Texte (.rtf und .cho):
 *
 *   [[ Kommentar ]]   — Sing- oder Spielanweisung, inline oder eigene Zeile
 *   | <Text>          — Takt-Marker am Zeilenanfang (Pipe + Leerzeichen/Tab)
 *   ### Titel         — Sektionsueberschrift (### bis ###### fuer Level 1-6)
 *
 * Die Marker sind bewusst als Plain-Text gewaehlt: in TextEdit, Word etc.
 * bleiben sie als normaler Text sichtbar, die App rendert sie speziell.
 */

export interface CommentMatch {
  /** Start-Index im Source-String (inkl. `[[`). */
  start: number
  /** End-Index (exklusiv, d.h. nach den `]]`). */
  end: number
  /** Innerer Text, Whitespace am Rand getrimmt. */
  text: string
}

const COMMENT_RE = /\[\[\s*([\s\S]+?)\s*\]\]/g
const SECTION_RE = /^(\s*)(#{1,6})\s+(.+?)\s*$/
const BAR_LEAD_RE = /^(\s*)\|(\s+)/

/** Sucht alle `[[ ... ]]`-Kommentare in einer Zeichenkette. Nicht verschachtelt. */
export function findCommentMatches(s: string): CommentMatch[] {
  const out: CommentMatch[] = []
  COMMENT_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = COMMENT_RE.exec(s)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, text: m[1] })
  }
  return out
}

/** True, wenn die Zeile nichts ausser `[[ ... ]]` enthaelt (nach Trim). */
export function isCommentOnlyLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.startsWith('[[') || !trimmed.endsWith(']]')) return false
  // Genau ein Kommentar-Paar, nichts daneben.
  const matches = findCommentMatches(trimmed)
  return matches.length === 1 &&
    matches[0].start === 0 &&
    matches[0].end === trimmed.length
}

/** Erkennt Markdown-artige Sektionsueberschrift `### Titel`.
 *  Wenn der Titel selbst weitere Marker (`[[ ]]` oder freistehendes `|`)
 *  enthaelt, ist die Zeile wahrscheinlich eine verschmolzene Mehrfach-Marker-
 *  Zeile ohne Zeilenumbruch — dann kein Heading, sondern Inline-Verarbeitung.
 */
export function detectSectionHeading(line: string): { level: number; title: string } | null {
  const m = SECTION_RE.exec(line)
  if (!m) return null
  const title = m[3]
  if (title.includes('[[')) return null
  if (/(^|\s)\|\s/.test(title)) return null
  return { level: m[2].length, title }
}

/** Erkennt Takt-Marker `|` am Zeilenanfang (gefolgt von Whitespace). */
export function detectBarLead(line: string): boolean {
  return BAR_LEAD_RE.test(line)
}

export interface BarSplit {
  /** Rest der Zeile nach dem Bar-Marker (ohne fuehrendes Pipe+Whitespace). */
  rest: string
  /** Preserved leading indent (falls Zeile mit Leerzeichen vor dem `|` beginnt). */
  indent: string
}

/** Entfernt das fuehrende `| ` und gibt den Rest zurueck. */
export function splitBarLead(line: string): BarSplit | null {
  const m = BAR_LEAD_RE.exec(line)
  if (!m) return null
  return { indent: m[1], rest: line.slice(m[0].length) }
}

export type InlineSpan =
  | { kind: 'text'; text: string }
  | { kind: 'comment'; text: string }
  | { kind: 'bar-initial'; text: string }

/** Splittet eine Zeichenkette an `[[ ... ]]`-Kommentaren in Text- und Comment-Spans. */
export function splitByCommentMarkers(s: string): InlineSpan[] {
  const matches = findCommentMatches(s)
  if (matches.length === 0) return [{ kind: 'text', text: s }]
  const out: InlineSpan[] = []
  let pos = 0
  for (const m of matches) {
    if (m.start > pos) out.push({ kind: 'text', text: s.slice(pos, m.start) })
    out.push({ kind: 'comment', text: m.text })
    pos = m.end
  }
  if (pos < s.length) out.push({ kind: 'text', text: s.slice(pos) })
  return out
}

/** Matcht `|` gefolgt von optionalem Whitespace und einem sichtbaren
 *  Non-Pipe-Zeichen. Das `|` und das Whitespace werden verschluckt; der
 *  folgende Char ist der sichtbare Taktanfang (der Viewer unterstreicht ihn).
 *  `||` matcht nicht (negatives Lookbehind) — doppelte Pipes bleiben
 *  als literal erhalten. */
const BAR_MARKER_RE = /(?<!\|)\|(\s*)([^|\s])/g

/**
 * Kombinierte Marker-Erkennung fuer den Viewer: findet zuerst `[[ ... ]]`,
 * dann innerhalb der verbleibenden Text-Spans alle `|<ws>X`-Taktanfangs-
 * Marker. Das `|` und das folgende Whitespace werden aus dem Output entfernt,
 * der erste nicht-Whitespace-Char danach wird als `bar-initial` markiert.
 */
export function splitInlineMarkers(s: string): InlineSpan[] {
  const out: InlineSpan[] = []
  for (const span of splitByCommentMarkers(s)) {
    if (span.kind !== 'text') {
      out.push(span)
      continue
    }
    const text = span.text
    let pos = 0
    BAR_MARKER_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = BAR_MARKER_RE.exec(text)) !== null) {
      if (m.index > pos) out.push({ kind: 'text', text: text.slice(pos, m.index) })
      out.push({ kind: 'bar-initial', text: m[2] })
      pos = m.index + m[0].length
    }
    if (pos < text.length) out.push({ kind: 'text', text: text.slice(pos) })
  }
  return out
}

/** Zeichen, die im Viewer als Melodiefuehrungs-Glyph (rot) gerendert werden.
 *  ASCII-Mapping: `/`→↗, `\\`→↘, `_`→→ (Source bleibt ASCII fuer Cross-Editor-
 *  Kompatibilitaet). Unicode-Pfeile und `~` bleiben unveraendert, bekommen
 *  aber die gleiche Glyph-Kennzeichnung. */
const GLYPH_MAP: Record<string, string> = {
  '/': '↗',
  '\\': '↘',
  '_': '→',
}
const MELODY_GLYPH_RE = /[/\\_~↖↑↗←→↙↓↘]/g

export interface MelodySpan {
  kind: 'text' | 'melody'
  text: string
}

export function splitMelodyChars(s: string): MelodySpan[] {
  const out: MelodySpan[] = []
  let pos = 0
  MELODY_GLYPH_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = MELODY_GLYPH_RE.exec(s)) !== null) {
    if (m.index > pos) out.push({ kind: 'text', text: s.slice(pos, m.index) })
    out.push({ kind: 'melody', text: GLYPH_MAP[m[0]] ?? m[0] })
    pos = m.index + m[0].length
  }
  if (pos < s.length) out.push({ kind: 'text', text: s.slice(pos) })
  return out
}
