/**
 * ChordPro format support — parse, serialize, and auto-detect.
 *
 * The on-disk `.cho` file format is ChordPro:
 *   {title: Fragile}
 *   {key: Bm}
 *
 *   {start_of_verse: Verse 1}
 *   If [Bm]blood will flow when [F#m]flesh and steel are one
 *   {end_of_verse}
 *
 * But users can also paste "Ultimate Guitar style" (chord lines above lyrics).
 * `parseChordSheet()` auto-detects which format the text is in.
 * `ensureChordPro()` converts plain text to ChordPro for saving.
 */

import { parseChordText } from '@/utils/chordParser'
import type { ChordLine, ChordPosition, ChordSection, ParsedChordContent } from '@/types/index'

// --- Format detection ---

/**
 * Detect whether `text` is already in ChordPro format.
 *
 * Indicators:
 * - Any directive `{x: ...}` or `{x}` (e.g. `{title:}`, `{sov}`)
 * - Inline chord syntax: `[Chord]` brackets that are NOT a section header
 *   (i.e. either multiple brackets on one line, or a single bracket with
 *   surrounding text)
 */
export function isChordPro(text: string): boolean {
  // Any ChordPro directive
  if (/\{[a-z_]+\s*[:}]/i.test(text)) return true

  // Inline chord syntax detection
  const lines = text.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const matches = [...trimmed.matchAll(/\[([^\]]+)\]/g)]
    if (matches.length === 0) continue
    if (matches.length > 1) return true
    // Single bracket — only counts as inline chord if there's other content on the line
    const single = `[${matches[0][1]}]`
    if (trimmed !== single) return true
  }
  return false
}

// --- ChordPro parser ---

const CHORD_TOKEN_RE = /^[A-G][b#]?(?:m(?:aj|in)?|M(?:aj)?|maj|dim|aug|sus)?(?:[0-9]+)?(?:sus[24]?)?(?:add[0-9]+)?(?:\/[A-G][b#]?)?$/

function classifySectionType(label: string): string {
  const l = label.toLowerCase()
  if (l.includes('verse') || l.includes('strophe')) return 'verse'
  if (l.includes('chorus') || l.includes('refrain')) return 'chorus'
  if (l.includes('bridge')) return 'bridge'
  if (l.includes('intro')) return 'intro'
  if (l.includes('outro')) return 'outro'
  if (l.includes('solo')) return 'solo'
  if (l.includes('pre-chorus') || l.includes('pre chorus')) return 'pre-chorus'
  return 'other'
}

/**
 * Parse a single line with inline `[Chord]Lyrics` syntax into clean text +
 * chord positions (column = position in the clean text where the chord starts).
 */
function parseInlineChordLine(line: string): { text: string; chords: ChordPosition[] } {
  const chords: ChordPosition[] = []
  let text = ''
  let i = 0
  while (i < line.length) {
    if (line[i] === '[') {
      const end = line.indexOf(']', i)
      if (end > -1) {
        const chord = line.slice(i + 1, end)
        if (CHORD_TOKEN_RE.test(chord)) {
          // Pad clean text so consecutive chords don't stack on the same column.
          // Happens with instrumental lines like "[Em] [D/F#] [G] [C]" where
          // only single spaces separate brackets — without padding, chord cols
          // end up 0,1,2,3 and all render on top of each other.
          if (chords.length > 0) {
            const prev = chords[chords.length - 1]
            const minCol = prev.col + prev.chord.length + 1
            if (text.length < minCol) {
              text += ' '.repeat(minCol - text.length)
            }
          }
          chords.push({ chord, col: text.length })
          i = end + 1
          continue
        }
      }
    }
    text += line[i]
    i++
  }
  return { text, chords }
}

/**
 * Detect the most likely key from a chord list using a simple heuristic.
 * Mirrors the implementation in chordParser.ts.
 */
function detectKey(chords: string[]): { key: string; confidence: number } {
  if (chords.length === 0) return { key: 'C', confidence: 0 }
  const roots: string[] = []
  for (const chord of chords) {
    const m = chord.trim().match(/^([A-G][b#]?)/)
    if (m) roots.push(m[1])
  }
  if (roots.length === 0) return { key: 'C', confidence: 0 }

  const weighted: Record<string, number> = {}
  roots.forEach((root, i) => {
    const weight = i === 0 ? 3 : i === roots.length - 1 ? 2 : 1
    weighted[root] = (weighted[root] || 0) + weight
  })
  const sorted = Object.entries(weighted).sort((a, b) => b[1] - a[1])
  const total = Object.values(weighted).reduce((a, b) => a + b, 0)
  const confidence = Math.min((sorted[0][1] / total) * 2, 1.0)
  return { key: sorted[0][0], confidence: Math.round(confidence * 100) / 100 }
}

/**
 * Parse a ChordPro string into the canonical ParsedChordContent structure.
 */
export function parseChordPro(text: string): ParsedChordContent {
  const lines = text.split('\n')
  const sections: ChordSection[] = []
  let currentSection: ChordSection = { type: 'intro', label: '', lines: [] }
  const allChords: string[] = []
  let detectedKey = ''

  const flush = () => {
    if (currentSection.lines.length > 0) sections.push(currentSection)
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '')

    if (!line.trim()) continue

    // Directive: {key: value} or {flag}
    const directiveMatch = line.match(/^\s*\{([a-z_]+)(?:\s*:\s*(.*?))?\}\s*$/i)
    if (directiveMatch) {
      const directive = directiveMatch[1].toLowerCase()
      const value = (directiveMatch[2] || '').trim()

      // Generic ChordPro 6 section directives: {start_of_<label>} / {end_of_<label>}
      // Also handles the short aliases sov/soc/sob and eov/eoc/eob.
      const SHORT_ALIASES: Record<string, string> = {
        sov: 'verse', soc: 'chorus', sob: 'bridge',
        eov: 'verse', eoc: 'chorus', eob: 'bridge',
      }
      const startMatch = directive.match(/^start_of_(.+)$/)
      const endMatch = directive.match(/^end_of_(.+)$/)
      const shortStart = directive in SHORT_ALIASES && directive.startsWith('s')
      const shortEnd = directive in SHORT_ALIASES && directive.startsWith('e')
      if (startMatch || shortStart) {
        const label = shortStart ? SHORT_ALIASES[directive] : startMatch![1]
        flush()
        const displayLabel = value || label.charAt(0).toUpperCase() + label.slice(1)
        currentSection = {
          type: classifySectionType(label),
          label: `[${displayLabel}]`,
          lines: [],
        }
        continue
      }
      if (endMatch || shortEnd) {
        flush()
        currentSection = { type: 'other', label: '', lines: [] }
        continue
      }

      switch (directive) {
        case 'title':
        case 't':
          // title is metadata — ignored for rendering (shown elsewhere)
          break
        case 'key':
          detectedKey = value
          break
        case 'comment':
        case 'c':
          // Inline comment — render as a label-less line of plain text
          currentSection.lines.push({ text: value, chords: [] })
          break
      }
      continue
    }

    // Plain section header `[Verse 1]` (Ultimate Guitar style, fallback)
    const sectionHeader = line.trim().match(/^\[([^\]]+)\]\s*$/)
    if (sectionHeader && !CHORD_TOKEN_RE.test(sectionHeader[1])) {
      flush()
      currentSection = {
        type: classifySectionType(sectionHeader[1]),
        label: `[${sectionHeader[1]}]`,
        lines: [],
      }
      continue
    }

    // Inline-chord line
    const { text: cleanText, chords } = parseInlineChordLine(line)
    if (chords.length > 0 || cleanText.trim()) {
      currentSection.lines.push({ text: cleanText, chords })
      allChords.push(...chords.map((c) => c.chord))
    }
  }

  flush()

  const uniqueChords = Array.from(new Set(allChords))
  const detected = detectedKey
    ? { key: detectedKey, confidence: 1 }
    : detectKey(allChords)

  return {
    sections,
    all_chords: uniqueChords,
    detected_key: detected.key,
    key_confidence: detected.confidence,
  }
}

// --- Unified entry: parse any chord sheet text ---

/**
 * Parse chord sheet text in either ChordPro or "Ultimate Guitar" plain format.
 * Auto-detects the format and dispatches to the right parser.
 */
export function parseChordSheet(text: string): ParsedChordContent {
  if (isChordPro(text)) return parseChordPro(text)
  return parseChordText(text)
}

// --- Serializer: ParsedChordContent → ChordPro string ---

function serializeInlineChordLine(line: ChordLine): string {
  if (line.chords.length === 0) return line.text
  const sorted = [...line.chords].sort((a, b) => a.col - b.col)
  let result = ''
  let cursor = 0
  for (const c of sorted) {
    if (c.col > line.text.length) {
      // Pad with spaces if the chord position is past the end of the lyric
      result += line.text.slice(cursor) + ' '.repeat(c.col - line.text.length)
      cursor = c.col
    } else {
      result += line.text.slice(cursor, c.col)
      cursor = c.col
    }
    result += `[${c.chord}]`
  }
  result += line.text.slice(cursor)
  return result
}

function unbracket(label: string): string {
  return label.replace(/^\[/, '').replace(/\]$/, '')
}

/**
 * Serialize a ParsedChordContent structure to a ChordPro string.
 */
export function serializeToChordPro(
  parsed: ParsedChordContent,
  meta: { title?: string; key?: string } = {},
): string {
  const out: string[] = []
  if (meta.title) out.push(`{title: ${meta.title}}`)
  const keyToWrite = meta.key || parsed.detected_key
  if (keyToWrite) out.push(`{key: ${keyToWrite}}`)
  if (out.length > 0) out.push('')

  for (const section of parsed.sections) {
    let startDirective = ''
    let endDirective = ''
    const labelText = unbracket(section.label)

    switch (section.type) {
      case 'verse':
        startDirective = `{start_of_verse${labelText ? `: ${labelText}` : ''}}`
        endDirective = '{end_of_verse}'
        break
      case 'chorus':
        startDirective = `{start_of_chorus${labelText ? `: ${labelText}` : ''}}`
        endDirective = '{end_of_chorus}'
        break
      case 'bridge':
        startDirective = `{start_of_bridge${labelText ? `: ${labelText}` : ''}}`
        endDirective = '{end_of_bridge}'
        break
      default:
        // Intro, Outro, Solo, etc. — use a comment directive as the section label
        if (labelText) startDirective = `{comment: ${labelText}}`
        break
    }

    if (startDirective) out.push(startDirective)
    for (const line of section.lines) {
      out.push(serializeInlineChordLine(line))
    }
    if (endDirective) out.push(endDirective)
    out.push('')
  }

  return out.join('\n').replace(/\n+$/, '\n')
}

/**
 * Convert any text input (ChordPro or plain) to a ChordPro string ready for
 * saving. If the input is already ChordPro, it is returned mostly as-is — but
 * a `{title:}` directive is prepended if missing.
 */
export function ensureChordPro(text: string, title: string): string {
  if (isChordPro(text)) {
    if (!/\{title\s*:/i.test(text)) {
      return `{title: ${title}}\n${text}`.replace(/\n+$/, '\n')
    }
    return text.replace(/\n+$/, '\n')
  }
  // Plain (Ultimate Guitar) → parse → serialize as ChordPro
  const parsed = parseChordText(text)
  return serializeToChordPro(parsed, { title })
}
