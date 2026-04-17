import { create } from 'zustand'
import { api } from '@/api/client.ts'
import { parseVocalPositions, type PreservedChord } from '@/utils/vocalPositions'
import { type NotePosition, buildNoteToken } from '@/utils/vocalValidation'

export interface VocalMark {
  line: number
  col: number
  token: string
}

export type VocalTool = 'beat' | 'note' | null

interface UndoEntry {
  kind: 'add' | 'remove'
  line: number
  col: number
  token: string
}

interface VocalInputState {
  mode: boolean
  text: string
  marks: Record<string, string>
  preservedChords: PreservedChord[]

  activeTool: VocalTool
  noteText: string
  notePosition: NotePosition

  undoStack: UndoEntry[]

  setMode: (on: boolean) => void
  setText: (text: string) => void
  loadFromChordPro: (body: string) => void

  setActiveTool: (tool: VocalTool) => void
  setNoteText: (text: string) => void
  setNotePosition: (pos: NotePosition) => void
  clearNoteText: () => void

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
  noteText: '',
  notePosition: 't' as NotePosition,

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
  setNoteText: (text) => set({ noteText: text.replace(/[{}]/g, '') }),
  setNotePosition: (pos) => set({ notePosition: pos }),
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
    } else {
      const text = s.noteText.trim()
      if (!text) return false
      token = buildNoteToken(s.notePosition, text)
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
