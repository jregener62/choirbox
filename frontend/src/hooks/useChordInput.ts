import { create } from 'zustand'
import { api } from '@/api/client.ts'
import { parseChordPositions } from '@/utils/chordPositions'

export interface ChordPosition {
  line: number
  col: number
  chord: string
}

interface ChordInputState {
  mode: boolean
  text: string
  chords: Record<string, string>
  activeCell: { line: number; col: number } | null

  setMode: (on: boolean) => void
  setText: (text: string) => void
  loadFromChordPro: (body: string) => void
  setChord: (line: number, col: number, chord: string) => void
  removeChord: (line: number, col: number) => void
  setActiveCell: (cell: { line: number; col: number } | null) => void
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
  activeCell: null,

  setMode: (on) => set({ mode: on, activeCell: on ? get().activeCell : null }),
  setText: (text) => set({ text }),

  loadFromChordPro: (body) => {
    const { text, chords } = parseChordPositions(body)
    const map: Record<string, string> = {}
    for (const c of chords) map[`${c.line}:${c.col}`] = c.chord
    set({ text, chords: map, activeCell: null })
  },

  setChord: (line, col, chord) => {
    const trimmed = chord.trim()
    if (!trimmed) return
    const key = cellKey(line, col)
    set((s) => ({ chords: { ...s.chords, [key]: trimmed } }))
  },

  removeChord: (line, col) => {
    const key = cellKey(line, col)
    set((s) => {
      if (!(key in s.chords)) return s
      const next = { ...s.chords }
      delete next[key]
      return { chords: next }
    })
  },

  setActiveCell: (cell) => set({ activeCell: cell }),

  reset: () => set({ chords: {}, activeCell: null }),

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
