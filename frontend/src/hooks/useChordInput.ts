import { create } from 'zustand'
import { api } from '@/api/client.ts'
import { parseChordPositions } from '@/utils/chordPositions'
import { isValidChord } from '@/utils/chordValidation'
import {
  findOpenSectionAbove,
  shiftChordsByLines,
  shiftChordsInLine,
  type SectionType as SectionTypeImp,
} from '@/utils/chordProEdit'

export interface ChordPosition {
  line: number
  col: number
  chord: string
}

export type ChordTool = 'chord' | null

export type SectionType = SectionTypeImp

interface UndoEntry {
  kind: 'add' | 'remove' | 'snapshot'
  /** For 'add' / 'remove'. */
  line?: number
  col?: number
  chord?: string
  /** For 'snapshot' — full state restore after arbitrary directive insertion. */
  text?: string
  chordsSnapshot?: Record<string, string>
}

interface ChordInputState {
  mode: boolean
  text: string
  /** Map "line:col" -> chord token */
  chords: Record<string, string>

  /** Currently active toolbar tool. null = no tool selected. */
  activeTool: ChordTool
  /** The chord token currently being built/loaded in the toolbar. */
  chordBuilder: string
  /** Free-text input for comment / section tools. */
  toolText: string

  undoStack: UndoEntry[]

  setMode: (on: boolean) => void
  setText: (text: string) => void
  loadFromChordPro: (body: string) => void

  setActiveTool: (tool: ChordTool) => void
  setChordBuilder: (token: string) => void
  appendBuilder: (s: string) => void
  backspaceBuilder: () => void
  clearBuilder: () => void
  setToolText: (t: string) => void
  clearToolText: () => void

  /** Tap handler: if a chord exists at (line, col), remove it; else if the
   *  builder holds a valid chord, set it there. Returns true if state changed. */
  toggleAt: (line: number, col: number) => boolean

  /** Insert `{c: text}` at (line, col) in the displayed text. Chord-Positionen
   *  rechts davon auf derselben Zeile verschieben sich um die eingefuegte
   *  Laenge. Ein Text-Snapshot wird in den Undo-Stack gelegt. Gibt true
   *  zurueck wenn eine Aenderung erfolgt ist. */
  insertCommentAt: (line: number, col: number, text: string) => boolean

  /** Fuegt `{start_of_<type>: label}` VOR `line` ein. Wenn eine Sektion noch
   *  offen ist (kein {end_of_…} vorher), wird sie automatisch davor
   *  geschlossen. Chord-Positionen der Zeilen danach werden mit-verschoben.
   *  Gibt true zurueck wenn eingefuegt wurde. */
  insertSectionBefore: (line: number, type: SectionType, label: string) => boolean

  undo: () => boolean
  clearAll: () => void
  reset: () => void

  list: () => ChordPosition[]
  exportChordPro: () => Promise<string>
  updateCho: (docId: number) => Promise<void>
}

function cellKey(line: number, col: number): string {
  return `${line}:${col}`
}

function takeSnapshot(text: string, chords: Record<string, string>): UndoEntry {
  return { kind: 'snapshot', text, chordsSnapshot: { ...chords } }
}

export const useChordInput = create<ChordInputState>((set, get) => ({
  mode: false,
  text: '',
  chords: {},

  activeTool: null,
  chordBuilder: '',
  toolText: '',

  undoStack: [],

  setMode: (on) => set({ mode: on, activeTool: on ? get().activeTool : null }),
  setText: (text) => set({ text }),

  loadFromChordPro: (body) => {
    const { text, chords } = parseChordPositions(body)
    const map: Record<string, string> = {}
    for (const c of chords) map[cellKey(c.line, c.col)] = c.chord
    set({ text, chords: map, undoStack: [] })
  },

  setActiveTool: (tool) => set({ activeTool: tool }),
  setChordBuilder: (token) => set({ chordBuilder: token }),
  appendBuilder: (s) => set((st) => ({ chordBuilder: st.chordBuilder + s })),
  backspaceBuilder: () =>
    set((st) => ({ chordBuilder: st.chordBuilder.slice(0, -1) })),
  clearBuilder: () => set({ chordBuilder: '' }),
  setToolText: (t) => set({ toolText: t }),
  clearToolText: () => set({ toolText: '' }),

  toggleAt: (line, col) => {
    const s = get()
    if (s.activeTool !== 'chord') return false
    const key = cellKey(line, col)
    const existing = s.chords[key]

    if (existing) {
      const next = { ...s.chords }
      delete next[key]
      set({
        chords: next,
        undoStack: [...s.undoStack, { kind: 'remove', line, col, chord: existing }],
      })
      return true
    }

    const token = s.chordBuilder.trim()
    if (!token || !isValidChord(token)) return false

    set({
      chords: { ...s.chords, [key]: token },
      undoStack: [...s.undoStack, { kind: 'add', line, col, chord: token }],
    })
    return true
  },

  insertCommentAt: (line, col, text) => {
    const trimmed = text.trim()
    if (!trimmed) return false
    const s = get()
    const snapshot = takeSnapshot(s.text, s.chords)
    const lines = s.text.split('\n')
    if (line < 0 || line >= lines.length) return false
    const raw = lines[line]
    const insertCol = Math.min(Math.max(col, 0), raw.length)
    const snippet = `{c: ${trimmed}}`
    lines[line] = raw.slice(0, insertCol) + snippet + raw.slice(insertCol)
    const newText = lines.join('\n')
    const newChords = shiftChordsInLine(s.chords, line, insertCol, snippet.length)
    set({
      text: newText,
      chords: newChords,
      undoStack: [...s.undoStack, snapshot],
    })
    return true
  },

  insertSectionBefore: (line, type, label) => {
    const s = get()
    const lines = s.text.split('\n')
    if (line < 0 || line > lines.length) return false

    // Scan upwards for an open section directive (no closing {end_of_*} in between).
    const openType = findOpenSectionAbove(lines, line)

    const startDir = `{start_of_${type}${label.trim() ? `: ${label.trim()}` : ''}}`
    const inserts: string[] = []
    if (openType) inserts.push(`{end_of_${openType}}`)
    inserts.push(startDir)

    const snapshot = takeSnapshot(s.text, s.chords)
    const newLines = [...lines.slice(0, line), ...inserts, ...lines.slice(line)]
    const newText = newLines.join('\n')
    const newChords = shiftChordsByLines(s.chords, line, inserts.length)
    set({
      text: newText,
      chords: newChords,
      undoStack: [...s.undoStack, snapshot],
    })
    return true
  },

  undo: () => {
    const s = get()
    if (s.undoStack.length === 0) return false
    const last = s.undoStack[s.undoStack.length - 1]
    const nextStack = s.undoStack.slice(0, -1)

    if (last.kind === 'snapshot') {
      set({
        text: last.text ?? '',
        chords: last.chordsSnapshot ?? {},
        undoStack: nextStack,
      })
      return true
    }

    const key = cellKey(last.line!, last.col!)
    if (last.kind === 'add') {
      const next = { ...s.chords }
      delete next[key]
      set({ chords: next, undoStack: nextStack })
    } else {
      set({
        chords: { ...s.chords, [key]: last.chord! },
        undoStack: nextStack,
      })
    }
    return true
  },

  clearAll: () => set({ chords: {}, undoStack: [] }),

  reset: () =>
    set({
      chords: {},
      undoStack: [],
      activeTool: null,
      chordBuilder: '',
      toolText: '',
    }),

  list: () => {
    const chords = get().chords
    return Object.entries(chords).map(([key, chord]) => {
      const [line, col] = key.split(':').map(Number)
      return { line, col, chord }
    })
  },

  exportChordPro: async () => {
    const { text, list } = get()
    const result = await api<{ cho_content: string }>('/chord-input/export', {
      method: 'POST',
      body: { text, chords: list() },
    })
    return result.cho_content
  },

  updateCho: async (docId) => {
    const cho = await get().exportChordPro()
    await api(`/documents/${docId}/content`, {
      method: 'PUT',
      body: { content: cho },
    })
  },
}))
