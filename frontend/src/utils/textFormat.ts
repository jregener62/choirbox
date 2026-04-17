import type { FormatFlags } from '@/hooks/useTextFormat'

/**
 * Persistenz von Text-Formatierungen (Bold/Italic/Underline/Strike/Farbe) im
 * .cho-File. Format-Info wird als `#`-Kommentare am Ende der Datei abgelegt:
 *
 *   # choirbox-format: line=4,start=3,end=7,b=1,color=red
 *
 * `#`-Zeilen sind in ChordPro offiziell Kommentare → externe Tools ignorieren
 * sie. Beim Parsen extrahieren wir diese Zeilen, bauen per-Char-Flags und
 * geben den restlichen Text ohne die Format-Kommentare zurueck.
 */

const FORMAT_COMMENT_RE = /^\s*#\s*choirbox-format\s*:\s*(.+)$/i

export function cellKey(line: number, col: number): string {
  return `${line}:${col}`
}

function flagsEqual(a: FormatFlags, b: FormatFlags): boolean {
  return (
    !!a.b === !!b.b &&
    !!a.i === !!b.i &&
    !!a.u === !!b.u &&
    !!a.s === !!b.s &&
    (a.color ?? '') === (b.color ?? '') &&
    (a.bg ?? '') === (b.bg ?? '')
  )
}

function hasAnyFlag(f: FormatFlags): boolean {
  return !!f.b || !!f.i || !!f.u || !!f.s || !!f.color || !!f.bg
}

/** Per-Char-Flags → Liste von Format-Comment-Zeilen. Konsekutive Zeichen
 *  mit identischen Flags werden zu Ranges zusammengefasst. */
export function serializeFormats(formats: Record<string, FormatFlags>): string[] {
  const byLine = new Map<number, Array<{ col: number; flags: FormatFlags }>>()
  for (const [key, flags] of Object.entries(formats)) {
    if (!hasAnyFlag(flags)) continue
    const [lineStr, colStr] = key.split(':')
    const line = Number(lineStr)
    const col = Number(colStr)
    if (Number.isNaN(line) || Number.isNaN(col)) continue
    if (!byLine.has(line)) byLine.set(line, [])
    byLine.get(line)!.push({ col, flags })
  }

  const out: string[] = []
  const sortedLines = [...byLine.keys()].sort((a, b) => a - b)
  for (const line of sortedLines) {
    const entries = byLine.get(line)!.sort((a, b) => a.col - b.col)
    let i = 0
    while (i < entries.length) {
      let j = i
      while (
        j + 1 < entries.length &&
        entries[j + 1].col === entries[j].col + 1 &&
        flagsEqual(entries[j + 1].flags, entries[i].flags)
      ) {
        j++
      }
      const start = entries[i].col
      const end = entries[j].col
      const f = entries[i].flags
      const parts = [`line=${line}`, `start=${start}`, `end=${end}`]
      if (f.b) parts.push('b=1')
      if (f.i) parts.push('i=1')
      if (f.u) parts.push('u=1')
      if (f.s) parts.push('s=1')
      if (f.color) parts.push(`color=${f.color}`)
      if (f.bg) parts.push(`bg=${f.bg}`)
      out.push(`# choirbox-format: ${parts.join(',')}`)
      i = j + 1
    }
  }
  return out
}

/** Trenne Format-Comment-Zeilen aus dem Text und baue daraus per-Char-Flags. */
export function parseFormatComments(text: string): {
  formats: Record<string, FormatFlags>
  cleanText: string
} {
  const inputLines = text.split('\n')
  const keepLines: string[] = []
  const formats: Record<string, FormatFlags> = {}

  for (const raw of inputLines) {
    const m = FORMAT_COMMENT_RE.exec(raw)
    if (!m) {
      keepLines.push(raw)
      continue
    }

    const kv: Record<string, string> = {}
    for (const part of m[1].split(',')) {
      const eq = part.indexOf('=')
      if (eq < 0) continue
      const k = part.slice(0, eq).trim()
      const v = part.slice(eq + 1).trim()
      if (k) kv[k] = v
    }

    const line = Number(kv.line)
    const start = Number(kv.start)
    const end = Number(kv.end)
    if (Number.isNaN(line) || Number.isNaN(start) || Number.isNaN(end)) continue
    if (end < start) continue

    const flags: FormatFlags = {}
    if (kv.b === '1') flags.b = true
    if (kv.i === '1') flags.i = true
    if (kv.u === '1') flags.u = true
    if (kv.s === '1') flags.s = true
    if (kv.color) flags.color = kv.color
    if (kv.bg) flags.bg = kv.bg

    if (!hasAnyFlag(flags)) continue

    for (let col = start; col <= end; col++) {
      formats[cellKey(line, col)] = { ...flags }
    }
  }

  // Trailing-Blank-Line vermeiden, wenn wir nur Comments entfernt haben
  while (keepLines.length > 0 && keepLines[keepLines.length - 1] === '') {
    keepLines.pop()
  }

  return { formats, cleanText: keepLines.join('\n') }
}

/** Haengt Format-Comments an einen cho-Body an, mit Leerzeile davor. */
export function appendFormatComments(
  cho: string,
  formats: Record<string, FormatFlags>,
): string {
  const comments = serializeFormats(formats)
  if (comments.length === 0) return cho
  const trimmed = cho.replace(/\s+$/, '')
  return `${trimmed}\n\n${comments.join('\n')}\n`
}
