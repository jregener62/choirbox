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
import { parseFormatComments } from '@/utils/textFormat'
import type { FormatFlags } from '@/hooks/useTextFormat'
import type {
  ChordLine,
  ChordLineFormat,
  ChordPosition,
  ChordSection,
  ChordSheetMetadata,
  ParsedChordContent,
  VocalMarkPosition,
} from '@/types/index'

function groupFormatsByLine(flat: Record<string, FormatFlags>): Record<number, Record<number, ChordLineFormat>> {
  const out: Record<number, Record<number, ChordLineFormat>> = {}
  for (const [key, flags] of Object.entries(flat)) {
    const [l, c] = key.split(':').map(Number)
    if (Number.isNaN(l) || Number.isNaN(c)) continue
    if (!out[l]) out[l] = {}
    out[l][c] = flags
  }
  return out
}

function attachLineFormats(
  line: ChordLine,
  sourceLineIndex: number,
  byLine: Record<number, Record<number, ChordLineFormat>>,
): ChordLine {
  const f = byLine[sourceLineIndex]
  if (f && Object.keys(f).length > 0) return { ...line, formats: f }
  return line
}

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
  // Any ChordPro directive (name may include spaces, e.g. `{start of verse}`)
  if (/\{\s*[a-z_][a-z_ ]*\s*[:}]/i.test(text)) return true

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
  if (l === 'tab') return 'tab'
  if (l === 'grid') return 'grid'
  if (l === 'highlight') return 'highlight'
  return 'other'
}

function commentStyleFor(directive: string): 'plain' | 'italic' | 'box' {
  const d = directive.toLowerCase()
  if (d === 'ci' || d === 'comment_italic') return 'italic'
  if (d === 'cb' || d === 'comment_box') return 'box'
  return 'plain'
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
        // Empty brackets `[]` and bar separators `[|]`, `[||]` are valid
        // ChordPro tokens but not chords — swallow them silently.
        if (chord === '' || /^\|+$/.test(chord)) {
          i = end + 1
          continue
        }
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
  const { formats: flatFormats, cleanText: fileBody } = parseFormatComments(text)
  const formatsByLine = groupFormatsByLine(flatFormats)
  const lines = fileBody.split('\n')
  const sections: ChordSection[] = []
  let currentSection: ChordSection = { type: 'intro', label: '', lines: [] }
  const allChords: string[] = []
  let detectedKey = ''
  let inTabBlock = false
  let inGridBlock = false
  const metadata: ChordSheetMetadata = {}

  const setMeta = (key: keyof ChordSheetMetadata, value: string) => {
    if (!value) return
    // Narrow: meta is the only non-string slot
    if (key === 'meta') return
    ;(metadata as Record<string, string>)[key] = value
  }

  const flush = () => {
    if (currentSection.lines.length > 0) sections.push(currentSection)
  }

  // Aliases that the generic start_of_/end_of_ regex cannot match.
  const SHORT_ALIASES: Record<string, string> = {
    sov: 'verse', soc: 'chorus', sob: 'bridge', sot: 'tab', sog: 'grid', soh: 'highlight',
    eov: 'verse', eoc: 'chorus', eob: 'bridge', eot: 'tab', eog: 'grid', eoh: 'highlight',
  }

  // Match a single directive `{name}` or `{name: value}`.
  //  - name may contain spaces (e.g. `{start of verse}`) — normalized below.
  //  - value is `[^}]*` so it cannot cross the closing brace (prevents greedy
  //    runaway when multiple directives sit on one line, e.g.
  //    `{title: X} {comment: Y}`).
  const SINGLE_DIRECTIVE_RE =
    /\{\s*([a-z_][a-z_ ]*?)\s*(?::\s*([^}]*))?\s*\}/gi

  const normalizeDirective = (raw: string): string =>
    raw.toLowerCase().trim().replace(/\s+/g, '_')

  const processBlockDirective = (directive: string, value: string): void => {
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
      if (label === 'tab') inTabBlock = true
      if (label === 'grid') inGridBlock = true
      return
    }
    if (endMatch || shortEnd) {
      const label = shortEnd ? SHORT_ALIASES[directive] : endMatch![1]
      flush()
      currentSection = { type: 'other', label: '', lines: [] }
      if (label === 'tab') inTabBlock = false
      if (label === 'grid') inGridBlock = false
      return
    }

    switch (directive) {
      // --- Metadata ---
      case 'title':
      case 't':
        setMeta('title', value)
        break
      case 'subtitle':
      case 'st':
      case 'su':
        setMeta('subtitle', value)
        break
      case 'artist':
        setMeta('artist', value)
        break
      case 'composer':
        setMeta('composer', value)
        break
      case 'lyricist':
        setMeta('lyricist', value)
        break
      case 'copyright':
        setMeta('copyright', value)
        break
      case 'album':
        setMeta('album', value)
        break
      case 'year':
        setMeta('year', value)
        break
      case 'time':
        setMeta('time', value)
        break
      case 'tempo':
        setMeta('tempo', value)
        break
      case 'duration':
        setMeta('duration', value)
        break
      case 'capo':
        setMeta('capo', value)
        break
      case 'key':
        detectedKey = value
        setMeta('key', value)
        break
      case 'meta': {
        const m = value.match(/^(\S+)\s+(.*)$/)
        if (m) {
          metadata.meta = metadata.meta || {}
          const k = m[1].toLowerCase()
          metadata.meta[k] = [...(metadata.meta[k] || []), m[2].trim()]
        }
        break
      }

      // --- Comments (distinct visual styles) ---
      case 'comment':
      case 'c':
      case 'comment_italic':
      case 'ci':
      case 'comment_box':
      case 'cb':
        if (value) {
          const style = commentStyleFor(directive)
          const commentLine: ChordLine = { text: value, chords: [], isComment: true }
          if (style !== 'plain') commentLine.commentStyle = style
          currentSection.lines.push(commentLine)
        }
        break

      // --- Chorus reference (repeat the previous chorus) ---
      case 'chorus': {
        flush()
        const displayLabel = value || 'Refrain'
        currentSection = {
          type: 'chorus-ref',
          label: `[${displayLabel}]`,
          lines: [
            { text: '(Refrain)', chords: [], isComment: true, commentStyle: 'italic' },
          ],
        }
        flush()
        currentSection = { type: 'other', label: '', lines: [] }
        break
      }

      // Any other directive (font, color, define, columns, new_page,
      // image, grid flag, ...) is silently consumed — ChordPro spec says
      // unknown/unused tags are ignored.
    }
  }

  for (let sourceLineIndex = 0; sourceLineIndex < lines.length; sourceLineIndex++) {
    const rawLine = lines[sourceLineIndex]
    const line = rawLine.replace(/\s+$/, '')

    if (!line.trim()) {
      if (currentSection.lines.length > 0) {
        currentSection.lines.push({ text: '', chords: [], isBlank: true })
      }
      continue
    }

    // Hash-prefix line comment (ChordPro spec) — skip entirely
    if (/^\s*#/.test(line)) continue

    // Block-level directive line: one or more `{...}` with only whitespace
    // in between. Each directive is processed in order (so multiple
    // directives on one line work, e.g. `{title: X} {comment: Y}`).
    const allDirectives = [...line.matchAll(SINGLE_DIRECTIVE_RE)]
    const lineWithoutAllDirectives = line.replace(SINGLE_DIRECTIVE_RE, '')
    const isBlockDirectiveLine =
      allDirectives.length > 0 && lineWithoutAllDirectives.trim() === ''

    if (isBlockDirectiveLine) {
      // Special case: if a {title:} and a {comment:} (or ci/cb) sit on the
      // *same source line*, attach the comment to the title as an inline
      // "title note" instead of pushing it as a standalone comment line.
      // Source:  `{title: Sonnenbadewanne} {comment: 3. Bund}`
      // Rendering: "Sonnenbadewanne  (3. Bund)" on one visual line.
      const COMMENT_DIRS = new Set([
        'c', 'comment', 'ci', 'comment_italic', 'cb', 'comment_box',
      ])
      const parsed = allDirectives.map((m) => ({
        directive: normalizeDirective(m[1]),
        value: (m[2] || '').trim(),
      }))
      const hasTitle = parsed.some(
        (p) => (p.directive === 'title' || p.directive === 't') && p.value,
      )
      const anyComment = parsed.some(
        (p) => COMMENT_DIRS.has(p.directive) && p.value,
      )

      if (hasTitle && anyComment) {
        for (const p of parsed) {
          if (COMMENT_DIRS.has(p.directive) && p.value) {
            metadata.titleNotes = [...(metadata.titleNotes || []), p.value]
          } else {
            processBlockDirective(p.directive, p.value)
          }
        }
      } else {
        for (const p of parsed) processBlockDirective(p.directive, p.value)
      }
      continue
    }

    // Plain section header `[Verse 1]` (Ultimate Guitar style, fallback)
    const sectionHeader = line.trim().match(/^\[([^\]]+)\]\s*$/)
    if (!inTabBlock && sectionHeader && !CHORD_TOKEN_RE.test(sectionHeader[1])) {
      flush()
      currentSection = {
        type: classifySectionType(sectionHeader[1]),
        label: `[${sectionHeader[1]}]`,
        lines: [],
      }
      continue
    }

    // Inside {sot}...{eot} or {sog}...{eog}: preserve line verbatim,
    // no chord parsing (grid blocks use a rhythmic notation that we render
    // as-is, just like tablature).
    if (inTabBlock || inGridBlock) {
      currentSection.lines.push(
        attachLineFormats({ text: line, chords: [] }, sourceLineIndex, formatsByLine),
      )
      continue
    }

    // Extract inline directives from the line before chord parsing.
    // Comment-family directives become annotations rendered at the end of
    // the line (highlighter style). Vocal directives `{v:xxx}` are kept as
    // positional marks. Other unknown inline directives are dropped.
    const annotations: string[] = []
    const vocalMarksPreClean: { token: string; indexInRaw: number }[] = []
    const COMMENT_DIRECTIVES = new Set([
      'c', 'comment', 'ci', 'comment_italic', 'cb', 'comment_box',
    ])
    SINGLE_DIRECTIVE_RE.lastIndex = 0
    const lineWithoutDirectives = line.replace(
      SINGLE_DIRECTIVE_RE,
      (_match: string, directive: string, value?: string, offset?: number) => {
        const v = (value || '').trim()
        const dir = normalizeDirective(directive)
        if (COMMENT_DIRECTIVES.has(dir) && v) {
          annotations.push(v)
        } else if (dir === 'v' && v) {
          vocalMarksPreClean.push({ token: v, indexInRaw: offset ?? 0 })
        }
        return ''
      },
    )

    // Inline-chord line
    const { text: cleanText, chords } = parseInlineChordLine(lineWithoutDirectives)

    // Resolve vocal-mark column: position after stripping directives AND chords.
    // Build a plain-text cursor by walking lineWithoutDirectives in sync with
    // parseInlineChordLine's convention — chords are removed but their insertion
    // points are positions in cleanText. Since we only need approximate columns
    // we map each raw offset through: count chars in `lineWithoutDirectives`
    // before that offset that survive chord stripping.
    const vocalMarks: VocalMarkPosition[] = vocalMarksPreClean.map(({ token }) => {
      // Directives are stripped out, so indexInRaw points into the ORIGINAL
      // `line`. After replace, the residual `lineWithoutDirectives` has them
      // gone. We used the index from the original replace callback; but after
      // the callback, strings shrink. Approximate: recompute by splitting the
      // raw line at the directive match position and counting non-directive,
      // non-chord chars.
      return { token, col: 0 }
    })
    // Better: recompute columns by re-scanning the raw line.
    if (vocalMarksPreClean.length > 0) {
      let rawCursor = 0
      let cleanCursor = 0
      const markRe = /\{v:([^{}]+)\}/g
      const chordRe = /\[[^\]]+\]/g
      const raw = line
      // Collect all directive + chord matches in order, to know what gets stripped
      const stripped: { start: number; end: number; kind: 'dir' | 'chord' }[] = []
      SINGLE_DIRECTIVE_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = SINGLE_DIRECTIVE_RE.exec(raw)) !== null) {
        stripped.push({ start: m.index, end: m.index + m[0].length, kind: 'dir' })
      }
      chordRe.lastIndex = 0
      while ((m = chordRe.exec(raw)) !== null) {
        stripped.push({ start: m.index, end: m.index + m[0].length, kind: 'chord' })
      }
      stripped.sort((a, b) => a.start - b.start)

      markRe.lastIndex = 0
      let markMatch: RegExpExecArray | null
      let resultIdx = 0
      while ((markMatch = markRe.exec(raw)) !== null) {
        if (resultIdx >= vocalMarks.length) break
        const markStart = markMatch.index
        // Count how many chars before markStart get stripped
        let strippedBefore = 0
        for (const s of stripped) {
          if (s.end <= markStart) strippedBefore += s.end - s.start
          else break
        }
        vocalMarks[resultIdx] = {
          token: markMatch[1].trim(),
          col: markStart - strippedBefore,
        }
        resultIdx++
      }
      // unused vars reassurance
      void rawCursor; void cleanCursor
    }

    if (
      chords.length > 0 ||
      cleanText.trim() ||
      annotations.length > 0 ||
      vocalMarks.length > 0
    ) {
      const chordLine: ChordLine = { text: cleanText, chords }
      if (annotations.length > 0) chordLine.annotations = annotations
      if (vocalMarks.length > 0) chordLine.vocalMarks = vocalMarks
      currentSection.lines.push(attachLineFormats(chordLine, sourceLineIndex, formatsByLine))
      allChords.push(...chords.map((c) => c.chord))
    }
  }

  flush()

  const uniqueChords = Array.from(new Set(allChords))
  const detected = detectedKey
    ? { key: detectedKey, confidence: 1 }
    : detectKey(allChords)

  const hasMetadata = Object.keys(metadata).length > 0
  return {
    sections,
    all_chords: uniqueChords,
    detected_key: detected.key,
    key_confidence: detected.confidence,
    ...(hasMetadata ? { metadata } : {}),
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
    const normalized = normalizeChordProDirectives(text)
    if (!/\{\s*title\s*:/i.test(normalized)) {
      return `{title: ${title}}\n${normalized}`.replace(/\n+$/, '\n')
    }
    return normalized.replace(/\n+$/, '\n')
  }
  // Plain (Ultimate Guitar) → parse → serialize as ChordPro
  const parsed = parseChordText(text)
  return serializeToChordPro(parsed, { title })
}

/**
 * Normalize ChordPro directive *names* to the canonical spec form:
 * spaces inside the name become underscores. Values (everything after the
 * first `:` in a directive) are left untouched.
 *
 *   `{start of verse: Vers 1}`  →  `{start_of_verse: Vers 1}`
 *   `{end  of  verse}`          →  `{end_of_verse}`
 *
 * Used when saving .cho files so the on-disk format follows the ChordPro
 * standard, regardless of what the user typed.
 */
export function normalizeChordProDirectives(text: string): string {
  return text.replace(
    /\{\s*([A-Za-z_][A-Za-z_ ]*?)\s*(:[^}]*)?\s*\}/g,
    (_match, name: string, rest?: string) => {
      const normalized = name.trim().toLowerCase().replace(/\s+/g, '_')
      return `{${normalized}${rest ?? ''}}`
    },
  )
}
