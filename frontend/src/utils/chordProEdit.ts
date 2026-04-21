/**
 * Pure Helper fuer ChordPro-Source-Manipulation. Werden vom SheetEditor-
 * Component fuer Cursor-/Selection-basierte Tag-Einfuegung verwendet.
 */

export type SectionType =
  | 'verse'
  | 'chorus'
  | 'bridge'
  | 'intro'
  | 'interlude'
  | 'outro'

/** Fuegt `snippet` an `offset` in `text` ein. `caretOffsetFromEnd` positioniert
 *  den Cursor nach dem Einfuegen `N` Stellen *vor* dem Ende des Snippets
 *  (nuetzlich fuer Template wie `[[  ]]`, wo der Cursor in die Mitte soll). */
export function insertAtOffset(
  text: string,
  offset: number,
  snippet: string,
  caretOffsetFromEnd = 0,
): { text: string; caret: number } {
  const clamped = Math.max(0, Math.min(offset, text.length))
  return {
    text: text.slice(0, clamped) + snippet + text.slice(clamped),
    caret: clamped + snippet.length - caretOffsetFromEnd,
  }
}

/** Ermittelt den Zeilenindex (0-basiert), in dem `offset` liegt. */
function lineIndexOfOffset(text: string, offset: number): number {
  let line = 0
  const max = Math.min(offset, text.length)
  for (let i = 0; i < max; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

/** Wrapt die Zeilen, die die Selektion `[start, end)` enthalten, mit
 *  `{start_of_<type>[: label]}` davor und `{end_of_<type>}` danach. Das
 *  eingefuegte Tag-Paar steht immer auf eigenen Zeilen. Bei leerer Selektion
 *  wird ein Template mit Cursor zwischen Start- und End-Tag eingefuegt.
 *
 *  Der zurueckgegebene `caret` steht nach dem Einfuegen am Ende der
 *  `{end_of_<type>}`-Zeile (bzw. in der leeren Mittelzeile des Templates). */
export function wrapLinesAsSection(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  type: SectionType,
  label: string,
): { text: string; caret: number } {
  const trimmedLabel = label.trim()
  const startDir = trimmedLabel
    ? `{start_of_${type}: ${trimmedLabel}}`
    : `{start_of_${type}}`
  const endDir = `{end_of_${type}}`

  if (selectionStart === selectionEnd) {
    const snippet = `${startDir}\n\n${endDir}`
    const caret = Math.min(selectionStart, text.length) + startDir.length + 1
    return {
      text: text.slice(0, selectionStart) + snippet + text.slice(selectionStart),
      caret,
    }
  }

  const lo = Math.min(selectionStart, selectionEnd)
  const hi = Math.max(selectionStart, selectionEnd)
  const lines = text.split('\n')
  const startLine = lineIndexOfOffset(text, lo)
  let endLine = lineIndexOfOffset(text, hi)
  // Selektion endet genau an einem Zeilenanfang (nach Shift+Down): letzte
  // eingeschlossene Zeile ist die davor.
  if (endLine > startLine && hi > 0 && text[hi - 1] === '\n') endLine--

  const newLines = [
    ...lines.slice(0, startLine),
    startDir,
    ...lines.slice(startLine, endLine + 1),
    endDir,
    ...lines.slice(endLine + 1),
  ]
  const newText = newLines.join('\n')

  // Caret am Ende der `{end_of_…}`-Zeile
  const endDirLineIdx = startLine + 1 + (endLine - startLine + 1)
  let caret = 0
  for (let i = 0; i < endDirLineIdx; i++) caret += newLines[i].length + 1
  caret += newLines[endDirLineIdx].length
  return { text: newText, caret }
}

/** Findet das Tag (`[…]` oder `{…}`), das die Cursor-Position `pos`
 *  umschliesst. Die Grenzen sind inklusive: `pos` direkt vor `[`/`{` oder
 *  direkt nach `]`/`}` zaehlt noch als "im Tag". Liefert `null`, wenn
 *  `pos` in Plain-Text liegt. */
export function findTagAt(
  text: string,
  pos: number,
): { start: number; end: number } | null {
  const re = /\[[^\]\n]+\]|\{[^{}\n]+\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const start = m.index
    const end = start + m[0].length
    if (pos >= start && pos <= end) return { start, end }
    if (start > pos) break
  }
  return null
}

/** Verschiebt das Tag `[start, end)` um ein Zeichen nach links: der Character
 *  direkt vor dem Tag wird an dessen Ende ausgetauscht. Liefert `null`, wenn
 *  das Tag bereits am Text-Anfang steht. */
export function moveTagLeft(
  text: string,
  start: number,
  end: number,
): { text: string; newStart: number; newEnd: number } | null {
  if (start <= 0 || end > text.length || start >= end) return null
  const tag = text.slice(start, end)
  const swapped = text[start - 1]
  const newText = text.slice(0, start - 1) + tag + swapped + text.slice(end)
  return { text: newText, newStart: start - 1, newEnd: end - 1 }
}

/** Verschiebt das Tag `[start, end)` um ein Zeichen nach rechts: der Character
 *  direkt nach dem Tag wird an dessen Anfang ausgetauscht. Liefert `null`,
 *  wenn das Tag bereits am Text-Ende steht. */
export function moveTagRight(
  text: string,
  start: number,
  end: number,
): { text: string; newStart: number; newEnd: number } | null {
  if (end >= text.length || start < 0 || start >= end) return null
  const tag = text.slice(start, end)
  const swapped = text[end]
  const newText = text.slice(0, start) + swapped + tag + text.slice(end + 1)
  return { text: newText, newStart: start + 1, newEnd: end + 1 }
}

/** Loescht das Tag `[start, end)` aus `text`. Liefert den resultierenden
 *  Text und die Cursor-Position (`start`). */
export function deleteTagAt(
  text: string,
  start: number,
  end: number,
): { text: string; caret: number } {
  return { text: text.slice(0, start) + text.slice(end), caret: start }
}
