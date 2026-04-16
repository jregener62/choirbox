import { create } from 'zustand'
import { api } from '@/api/client.ts'
import { parseChordPositions, type PreservedVocalMark } from '@/utils/chordPositions'
import { isValidChord } from '@/utils/chordValidation'

export interface ChordPosition {
  line: number
  col: number
  chord: string
}

export type ChordTool = 'chord' | null

interface UndoEntry {
  kind: 'add' | 'remove'
  line: number
  col: number
  chord: string
}

interface ChordInputState {
  mode: boolean
  text: string
  /** Map "line:col" -> chord token */
  chords: Record<string, string>
  /** Vocal markers stripped from the displayed text — re-inserted on save. */
  preservedVocals: PreservedVocalMark[]

  /** Currently active toolbar tool. null = no tool selected. */
  activeTool: ChordTool
  /** The chord token currently being built/loaded in the toolbar. */
  chordBuilder: string

  undoStack: UndoEntry[]

  setMode: (on: boolean) => void
  setText: (text: string) => void
  loadFromChordPro: (body: string) => void

  setActiveTool: (tool: ChordTool) => void
  setChordBuilder: (token: string) => void
  appendBuilder: (s: string) => void
  backspaceBuilder: () => void
  clearBuilder: () => void

  /** Tap handler: if a chord exists at (line, col), remove it; else if the
   *  builder holds a valid chord, set it there. Returns true if state changed. */
  toggleAt: (line: number, col: number) => boolean

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

export const useChordInput = create<ChordInputState>((set, get) => ({
  mode: false,
  text: '',
  chords: {},
  preservedVocals: [],

  activeTool: null,
  chordBuilder: '',

  undoStack: [],

  setMode: (on) => set({ mode: on, activeTool: on ? get().activeTool : null }),
  setText: (text) => set({ text, preservedVocals: [] }),

  loadFromChordPro: (body) => {
    const { text, chords, preservedVocals } = parseChordPositions(body)
    const map: Record<string, string> = {}
    for (const c of chords) map[cellKey(c.line, c.col)] = c.chord
    set({ text, chords: map, preservedVocals, undoStack: [] })
  },

  setActiveTool: (tool) => set({ activeTool: tool }),
  setChordBuilder: (token) => set({ chordBuilder: token }),
  appendBuilder: (s) => set((st) => ({ chordBuilder: st.chordBuilder + s })),
  backspaceBuilder: () =>
    set((st) => ({ chordBuilder: st.chordBuilder.slice(0, -1) })),
  clearBuilder: () => set({ chordBuilder: '' }),

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

  undo: () => {
    const s = get()
    if (s.undoStack.length === 0) return false
    const last = s.undoStack[s.undoStack.length - 1]
    const nextStack = s.undoStack.slice(0, -1)
    const key = cellKey(last.line, last.col)
    if (last.kind === 'add') {
      const next = { ...s.chords }
      delete next[key]
      set({ chords: next, undoStack: nextStack })
    } else {
      set({
        chords: { ...s.chords, [key]: last.chord },
        undoStack: nextStack,
      })
    }
    return true
  },

  clearAll: () => set({ chords: {}, undoStack: [] }),

  reset: () =>
    set({
      chords: {},
      preservedVocals: [],
      undoStack: [],
      activeTool: null,
      chordBuilder: '',
    }),

  list: () => {
    const chords = get().chords
    return Object.entries(chords).map(([key, chord]) => {
      const [line, col] = key.split(':').map(Number)
      return { line, col, chord }
    })
  },

  exportChordPro: async () => {
    const { text, list, preservedVocals } = get()
    const result = await api<{ cho_content: string }>('/chord-input/export', {
      method: 'POST',
      body: {
        text,
        chords: list(),
        vocals: preservedVocals.map(v => ({ line: v.line, col: v.col, token: v.token })),
      },
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
