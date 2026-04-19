/**
 * Minimal RTF-Parser fuer ChoirBox.
 *
 * Versteht das RTF-Subset, das ChoirBox selbst erzeugt, und ist tolerant
 * gegenueber RTF aus externen Editoren (TextEdit, Word, WordPad, LibreOffice)
 * — unbekannte Control-Words werden ignoriert, unbekannte / ignorable
 * Destinations (z.B. `{\*\expandedcolortbl ...}`, `{\stylesheet ...}`) werden
 * komplett uebersprungen.
 *
 * Subset:
 *  Character: \b \b0 \i \i0 \ul \ulnone \strike \strike0
 *             \fs<n>  \cf<n>  \highlight<n>  \f<n>
 *  Structure: \par \line \tab
 *  Escapes:   \\ \{ \} \'xx  \u<N>  \~  \-  \_
 *  Typo:      \endash \emdash \lquote \rquote \ldblquote \rdblquote \bullet
 *  Destinations (parsed): fonttbl, colortbl
 *  Destinations (skipped): info, stylesheet, header, footer, pict, and any
 *                          group starting with `\*`.
 */

export interface RtfFormat {
  b?: boolean
  i?: boolean
  u?: boolean
  s?: boolean
  /** Font size in points (RTF speichert half-points in \fs<n>, wir halbieren). */
  fontSize?: number
  /** Foreground color as #rrggbb, or undefined for default. */
  color?: string
  /** Highlight color as #rrggbb, or undefined. */
  bg?: string
}

export interface RtfRun {
  text: string
  format: RtfFormat
}

export interface RtfParagraph {
  runs: RtfRun[]
}

export interface ParsedRtf {
  paragraphs: RtfParagraph[]
  /** Colortbl: Index 0 is 'auto' (null). Explicit colors start at 1. */
  colorTable: (string | null)[]
  fontTable: Record<number, string>
}

interface ScopeState {
  format: RtfFormat
  destination: Destination
  fontEntry: number | null
  colorEntry: { r: number; g: number; b: number } | null
}

type Destination =
  | 'normal'
  | 'fonttbl'
  | 'colortbl'
  | 'skip'

const CP1252_UPPER: Record<number, string> = {
  0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E',
  0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021', 0x88: '\u02C6',
  0x89: '\u2030', 0x8A: '\u0160', 0x8B: '\u2039', 0x8C: '\u0152',
  0x8E: '\u017D', 0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C',
  0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
  0x98: '\u02DC', 0x99: '\u2122', 0x9A: '\u0161', 0x9B: '\u203A',
  0x9C: '\u0153', 0x9E: '\u017E', 0x9F: '\u0178',
}

function decodeCp1252(byte: number): string {
  if (byte < 0x80 || byte >= 0xA0) return String.fromCharCode(byte)
  return CP1252_UPPER[byte] ?? ''
}

function toHex(n: number): string {
  const s = Math.max(0, Math.min(255, n)).toString(16)
  return s.length === 1 ? '0' + s : s
}

function rgbHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/** Map of simple control-symbol → literal text. */
const SIMPLE_SYMBOLS: Record<string, string> = {
  endash: '\u2013',
  emdash: '\u2014',
  lquote: '\u2018',
  rquote: '\u2019',
  ldblquote: '\u201C',
  rdblquote: '\u201D',
  bullet: '\u2022',
  tab: '\t',
}

export function parseRtf(source: string): ParsedRtf {
  let pos = 0
  const len = source.length

  const paragraphs: RtfParagraph[] = []
  let currentRuns: RtfRun[] = []
  let currentText = ''
  let currentFormat: RtfFormat = {}
  let destination: Destination = 'normal'

  const colorTable: (string | null)[] = [null]
  const fontTable: Record<number, string> = {}
  let pendingColor: { r: number; g: number; b: number } = { r: 0, g: 0, b: 0 }
  let colorEntryStarted = false
  let pendingFontIdx: number | null = null
  let pendingFontName = ''

  const stack: ScopeState[] = []

  function flushRun() {
    if (destination !== 'normal') return
    if (currentText === '') return
    currentRuns.push({ text: currentText, format: { ...currentFormat } })
    currentText = ''
  }

  function endParagraph() {
    flushRun()
    if (destination !== 'normal') return
    paragraphs.push({ runs: currentRuns })
    currentRuns = []
  }

  function appendText(s: string) {
    if (destination === 'normal') {
      currentText += s
    } else if (destination === 'fonttbl') {
      // ';' terminates a font-table entry in the RTF spec.
      for (const ch of s) {
        if (ch === ';') commitPendingFont()
        else pendingFontName += ch
      }
    } else if (destination === 'colortbl') {
      // ';' separates color-table entries. Each run of \red \green \blue
      // collapses into one entry when we see the ';'.
      for (const ch of s) {
        if (ch === ';') commitPendingColor()
      }
    }
  }

  function commitPendingFont() {
    if (pendingFontIdx !== null) {
      const name = pendingFontName.replace(/;$/, '').trim()
      if (name) fontTable[pendingFontIdx] = name
      pendingFontIdx = null
      pendingFontName = ''
    }
  }

  function commitPendingColor() {
    if (colorEntryStarted) {
      colorTable.push(rgbHex(pendingColor.r, pendingColor.g, pendingColor.b))
      pendingColor = { r: 0, g: 0, b: 0 }
      colorEntryStarted = false
    }
  }

  function applyControl(name: string, param: number | null) {
    if (destination === 'skip') return

    // Destinations that switch context for their group
    if (name === 'fonttbl') { destination = 'fonttbl'; return }
    if (name === 'colortbl') { destination = 'colortbl'; return }
    if (
      name === 'stylesheet' || name === 'info' || name === 'header' ||
      name === 'footer' || name === 'pict' || name === 'object' ||
      name === 'generator' || name === 'filetbl' || name === 'listtable' ||
      name === 'listoverridetable' || name === 'revtbl' || name === 'xmlnstbl'
    ) {
      destination = 'skip'
      return
    }

    if (destination === 'fonttbl') {
      if (name === 'f' && param !== null) {
        commitPendingFont()
        pendingFontIdx = param
        pendingFontName = ''
      }
      return
    }

    if (destination === 'colortbl') {
      if (name === 'red')   { pendingColor.r = param ?? 0; colorEntryStarted = true }
      else if (name === 'green') { pendingColor.g = param ?? 0; colorEntryStarted = true }
      else if (name === 'blue')  { pendingColor.b = param ?? 0; colorEntryStarted = true }
      return
    }

    // --- Character formatting --- (flush current text before changing format)
    switch (name) {
      case 'b':       flushRun(); currentFormat.b = param !== 0; return
      case 'i':       flushRun(); currentFormat.i = param !== 0; return
      case 'ul':      flushRun(); currentFormat.u = param !== 0; return
      case 'ulnone':  flushRun(); currentFormat.u = false; return
      case 'strike':  flushRun(); currentFormat.s = param !== 0; return
      case 'fs':
        if (param !== null) { flushRun(); currentFormat.fontSize = param / 2 }
        return
      case 'cf':
        if (param !== null) {
          flushRun()
          const c = colorTable[param]
          currentFormat.color = c ?? undefined
        }
        return
      case 'highlight':
      case 'cb':
      case 'chcbpat':
        if (param !== null) {
          flushRun()
          const c = colorTable[param]
          currentFormat.bg = c ?? undefined
        }
        return
      case 'plain':
        flushRun()
        currentFormat = {}
        return
      case 'par':
        endParagraph()
        return
      case 'line':
        appendText('\n')
        return
      case 'tab':
        appendText('\t')
        return
    }

    if (name in SIMPLE_SYMBOLS) {
      appendText(SIMPLE_SYMBOLS[name])
      return
    }

    // Unicode codepoint: \u<signed-16-bit> — skip the following fallback char.
    if (name === 'u' && param !== null) {
      const cp = param < 0 ? param + 65536 : param
      appendText(String.fromCodePoint(cp))
      // Skip exactly one fallback character. That fallback may itself be a
      // \'xx hex-escape (4 source chars) or a control word, but in the vast
      // majority of real-world RTF it's a single ASCII char (often '?').
      if (pos < len) {
        if (source[pos] === '\\') {
          if (source[pos + 1] === "'") {
            pos += 4  // past \'xx
          } else if (/[a-zA-Z]/.test(source[pos + 1] ?? '')) {
            // Skip a control word as the fallback (rare, but spec-valid).
            pos++
            while (pos < len && /[a-zA-Z]/.test(source[pos])) pos++
            if (pos < len && (source[pos] === '-' || /[0-9]/.test(source[pos]))) {
              if (source[pos] === '-') pos++
              while (pos < len && /[0-9]/.test(source[pos])) pos++
            }
            if (pos < len && source[pos] === ' ') pos++
          } else {
            pos += 2
          }
        } else {
          pos++
        }
      }
      return
    }
    // Unknown control-word — silently ignore.
  }

  while (pos < len) {
    const ch = source[pos]

    if (ch === '{') {
      flushRun()
      stack.push({
        format: { ...currentFormat },
        destination,
        fontEntry: pendingFontIdx,
        colorEntry: colorEntryStarted ? { ...pendingColor } : null,
      })
      pos++
      continue
    }

    if (ch === '}') {
      flushRun()
      if (destination === 'colortbl') commitPendingColor()
      if (destination === 'fonttbl') commitPendingFont()
      const prev = stack.pop()
      if (prev) {
        currentFormat = prev.format
        destination = prev.destination
        pendingFontIdx = prev.fontEntry
      }
      pos++
      continue
    }

    if (ch === '\\') {
      pos++
      if (pos >= len) break
      const next = source[pos]

      if (/[a-zA-Z]/.test(next)) {
        // Control word
        let end = pos
        while (end < len && /[a-zA-Z]/.test(source[end])) end++
        const name = source.slice(pos, end)
        pos = end
        let param: number | null = null
        if (pos < len && (source[pos] === '-' || /[0-9]/.test(source[pos]))) {
          let nEnd = pos
          if (source[nEnd] === '-') nEnd++
          while (nEnd < len && /[0-9]/.test(source[nEnd])) nEnd++
          param = parseInt(source.slice(pos, nEnd), 10)
          pos = nEnd
        }
        // Consume the single space delimiter that terminates a control word.
        if (pos < len && source[pos] === ' ') pos++
        applyControl(name, param)
        continue
      }

      // Control symbol (single char or \'xx)
      if (next === '\\' || next === '{' || next === '}') {
        appendText(next)
        pos++
        continue
      }
      if (next === "'") {
        pos++
        const hex = source.slice(pos, pos + 2)
        pos += 2
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          appendText(decodeCp1252(parseInt(hex, 16)))
        }
        continue
      }
      if (next === '~') { appendText('\u00A0'); pos++; continue }
      if (next === '-' || next === '_') { pos++; continue }  // optional/nb hyphen
      if (next === '*') {
        // Ignorable-destination marker: the following control word starts a
        // group we should skip. Simplest robust handling: flip the current
        // scope to 'skip'. The matching '}' restores the parent.
        destination = 'skip'
        pos++
        continue
      }
      if (next === '\n' || next === '\r') {
        // `\<LF>` / `\<CR>` — TextEdit/Cocoa-Konvention fuer Soft-Line-Break
        // innerhalb eines Paragraphs (wie `\line`). Als `\n` in den Text
        // einfuegen; `splitParagraphIntoLines` im Viewer behandelt das dann
        // wie eine echte Zeile.
        appendText('\n')
        pos++
        if (next === '\r' && source[pos] === '\n') pos++
        continue
      }
      // Unknown control symbol — skip it silently.
      pos++
      continue
    }

    if (ch === '\n' || ch === '\r') {
      // RTF ignores raw line breaks in source.
      pos++
      continue
    }

    appendText(ch)
    pos++
  }

  endParagraph()
  // Drop a trailing empty paragraph that often follows the final \par.
  while (paragraphs.length > 0 && paragraphs[paragraphs.length - 1].runs.length === 0) {
    paragraphs.pop()
  }

  return { paragraphs, colorTable, fontTable }
}
