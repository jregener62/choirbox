import { create } from 'zustand'
import { api } from '@/api/client.ts'
import { parseVocalPositions, type PreservedChord } from '@/utils/vocalPositions'

export interface VocalMark {
  line: number
  col: number
  token: string
}

export type VocalTool = 'beat' | 'interval' | 'note' | null

interface UndoEntry {
  kind: 'add' | 'remove'
  line: number
  col: number
  token: string
}

interface VocalInputState {
  mode: boolean
  text: string
  /** Map "line:col" -> token */
  marks: Record<string, string>
  /** Chord markers stripped from the displayed text — re-inserted on save. */
  preservedChords: PreservedChord[]

  /** Currently active toolbar tool. null = no tool selected. */
  activeTool: VocalTool
  /** Interval direction when interval tool is active. */
  intervalDir: '+' | '-'
  /** Interval magnitude (1..12) when interval tool is active. */
  intervalNum: number
  /** Free-text comment for the note tool. */
  noteText: string

  undoStack: UndoEntry[]

  setMode: (on: boolean) => void
  setText: (text: string) => void
  loadFromChordPro: (body: string) => void

  setActiveTool: (tool: VocalTool) => void
  setIntervalDir: (dir: '+' | '-') => void
  setIntervalNum: (n: number) => void
  setNoteText: (text: string) => void
  clearNoteText: () => void

  /** Tap handler: if a mark exists at (line, col), remove it; otherwise
   *  set a new mark with the token derived from the active tool.
   *  Returns true if the state changed, false if no tool active or noop. */
  toggleAt: (line: number, col: number) => boolean

  undo: () => boolean
  clearAll: () => void
  reset: () => void

  list: () => VocalMark[]
  exportChordPro: () => Promise<string>
  updateCho: (docId: number) => Promise<void>
}

function cellKey(line: number, col: number): string {
  return `${line}:${col}`
}

export const useVocalInput = create<VocalInputState>((set, get) => ({
  mode: false,
  text: '',
  marks: {},
  preservedChords: [],

  activeTool: null,
  intervalDir: '+',
  intervalNum: 5,
  noteText: '',

  undoStack: [],

  setMode: (on) => set({ mode: on, activeTool: on ? get().activeTool : null }),
  setText: (text) => set({ text, preservedChords: [] }),

  loadFromChordPro: (body) => {
    const { text, marks, preservedChords } = parseVocalPositions(body)
    const map: Record<string, string> = {}
    for (const m of marks) map[cellKey(m.line, m.col)] = m.token
    set({ text, marks: map, preservedChords, undoStack: [] })
  },

  setActiveTool: (tool) => set({ activeTool: tool }),
  setIntervalDir: (dir) => set({ intervalDir: dir }),
  setIntervalNum: (n) => {
    const clamped = Math.max(1, Math.min(12, Math.floor(n)))
    set({ intervalNum: clamped })
  },
  // Strip braces — token format forbids `{` and `}`. Trim leading/trailing
  // whitespace but keep internal spaces for readable comments.
  setNoteText: (text) => set({ noteText: text.replace(/[{}]/g, '') }),
  clearNoteText: () => set({ noteText: '' }),

  toggleAt: (line, col) => {
    const s = get()
    if (!s.activeTool) return false
    const key = cellKey(line, col)
    const existing = s.marks[key]

    if (existing) {
      const next = { ...s.marks }
      delete next[key]
      set({
        marks: next,
        undoStack: [...s.undoStack, { kind: 'remove', line, col, token: existing }],
      })
      return true
    }

    let token: string
    if (s.activeTool === 'beat') {
      token = '1'
    } else if (s.activeTool === 'interval') {
      token = `${s.intervalDir}${s.intervalNum}`
    } else {
      // note tool — requires non-empty text
      const text = s.noteText.trim()
      if (!text) return false
      token = `n:${text}`
    }
    set({
      marks: { ...s.marks, [key]: token },
      undoStack: [...s.undoStack, { kind: 'add', line, col, token }],
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
      const next = { ...s.marks }
      delete next[key]
      set({ marks: next, undoStack: nextStack })
    } else {
      set({
        marks: { ...s.marks, [key]: last.token },
        undoStack: nextStack,
      })
    }
    return true
  },

  clearAll: () => set({ marks: {}, undoStack: [] }),

  reset: () =>
    set({ marks: {}, preservedChords: [], undoStack: [], activeTool: null }),

  list: () => {
    const marks = get().marks
    return Object.entries(marks).map(([key, token]) => {
      const [line, col] = key.split(':').map(Number)
      return { line, col, token }
    })
  },

  exportChordPro: async () => {
    const { text, list, preservedChords } = get()
    const result = await api<{ cho_content: string }>(
      '/vocal-input/export',
      {
        method: 'POST',
        body: {
          text,
          marks: list(),
          chords: preservedChords.map(c => ({ line: c.line, col: c.col, chord: c.chord })),
        },
      },
    )
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
