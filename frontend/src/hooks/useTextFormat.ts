import { create } from 'zustand'
import { parseFormatComments } from '@/utils/textFormat'

export type FormatFlag = 'b' | 'i' | 'u' | 's'

export interface FormatFlags {
  b?: boolean
  i?: boolean
  u?: boolean
  s?: boolean
  /** Textfarbe aus der Toolbar-Palette, z.B. "red"; undefined = Standard. */
  color?: string
  /** Textmarker-Hintergrund, z.B. "yellow" | "red"; undefined = keine Markierung. */
  bg?: string
}

export interface FormatSelection {
  line: number
  start: number
  end: number
}

function cellKey(line: number, col: number): string {
  return `${line}:${col}`
}

interface TextFormatState {
  /** Map "line:col" -> FormatFlags fuer dieses Zeichen. */
  formats: Record<string, FormatFlags>
  /** Aktuelle Drag-Selection (single-line). */
  selection: FormatSelection | null

  setSelection: (sel: FormatSelection | null) => void
  setFormats: (formats: Record<string, FormatFlags>) => void

  /** Laede per-Char-Formate aus den `# choirbox-format:` Kommentaren
   *  eines cho-Bodies. */
  loadFromChordPro: (body: string) => void

  /** Toggle eines Flags (b/i/u/s) auf der aktuellen Selection. Wenn alle
   *  Zeichen das Flag bereits haben, wird es entfernt, sonst gesetzt. */
  toggleFlag: (flag: FormatFlag) => void
  /** Farbe auf die aktuelle Selection setzen. Leerstring / undefined = entfernen. */
  setColor: (color: string | undefined) => void
  /** Hintergrund-Hervorhebung auf die aktuelle Selection setzen. */
  setBg: (bg: string | undefined) => void

  /** True, wenn alle Zeichen der aktuellen Selection das Flag gesetzt haben. */
  isAllSet: (flag: FormatFlag) => boolean
  /** "": keine Farbe; "name": einheitliche Farbe; null: gemischt oder keine Selection. */
  currentColor: () => string | null
  /** "": kein Hintergrund; "name": einheitlich; null: gemischt oder keine Selection. */
  currentBg: () => string | null

  clearAll: () => void
  reset: () => void
}

export const useTextFormat = create<TextFormatState>((set, get) => ({
  formats: {},
  selection: null,

  setSelection: (sel) => set({ selection: sel }),
  setFormats: (formats) => set({ formats }),

  loadFromChordPro: (body) => {
    const { formats } = parseFormatComments(body)
    set({ formats, selection: null })
  },

  toggleFlag: (flag) => {
    const { selection, formats } = get()
    if (!selection) return
    const isAll = get().isAllSet(flag)
    const next = { ...formats }
    for (let col = selection.start; col <= selection.end; col++) {
      const k = cellKey(selection.line, col)
      const f: FormatFlags = { ...(next[k] ?? {}) }
      if (isAll) delete f[flag]
      else f[flag] = true
      if (Object.keys(f).length === 0) delete next[k]
      else next[k] = f
    }
    set({ formats: next })
  },

  setColor: (color) => {
    const { selection, formats } = get()
    if (!selection) return
    const next = { ...formats }
    for (let col = selection.start; col <= selection.end; col++) {
      const k = cellKey(selection.line, col)
      const f: FormatFlags = { ...(next[k] ?? {}) }
      if (!color) delete f.color
      else f.color = color
      if (Object.keys(f).length === 0) delete next[k]
      else next[k] = f
    }
    set({ formats: next })
  },

  setBg: (bg) => {
    const { selection, formats } = get()
    if (!selection) return
    const next = { ...formats }
    for (let col = selection.start; col <= selection.end; col++) {
      const k = cellKey(selection.line, col)
      const f: FormatFlags = { ...(next[k] ?? {}) }
      if (!bg) delete f.bg
      else f.bg = bg
      if (Object.keys(f).length === 0) delete next[k]
      else next[k] = f
    }
    set({ formats: next })
  },

  isAllSet: (flag) => {
    const { selection, formats } = get()
    if (!selection) return false
    for (let col = selection.start; col <= selection.end; col++) {
      const k = cellKey(selection.line, col)
      if (!formats[k]?.[flag]) return false
    }
    return true
  },

  currentColor: () => {
    const { selection, formats } = get()
    if (!selection) return null
    let first: string | undefined
    let initialized = false
    for (let col = selection.start; col <= selection.end; col++) {
      const k = cellKey(selection.line, col)
      const c = formats[k]?.color
      if (!initialized) { first = c; initialized = true }
      else if (c !== first) return null
    }
    return first ?? ''
  },

  currentBg: () => {
    const { selection, formats } = get()
    if (!selection) return null
    let first: string | undefined
    let initialized = false
    for (let col = selection.start; col <= selection.end; col++) {
      const k = cellKey(selection.line, col)
      const c = formats[k]?.bg
      if (!initialized) { first = c; initialized = true }
      else if (c !== first) return null
    }
    return first ?? ''
  },

  clearAll: () => set({ formats: {} }),
  reset: () => set({ formats: {}, selection: null }),
}))
