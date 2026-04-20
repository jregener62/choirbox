import { create } from 'zustand'
import { api } from '@/api/client.ts'

export type ChordTool = 'chord' | null

/**
 * Zustand fuer den ChordPro-Text-Editor.
 *
 * Der Editor arbeitet direkt auf dem ChordPro-Quelltext. Tools fuegen
 * Standard-Directives (`[Chord]`, `{comment: …}`, `{start_of_verse}` …) an
 * die Cursor-Position ein oder wrappen die aktuelle Selektion. Kein
 * separates Chord-State-Mapping mehr — der Text ist Single-Source-of-Truth.
 */
interface ChordInputState {
  mode: boolean
  /** Full ChordPro source — was in Dropbox gespeichert wird. */
  text: string

  /** Currently active toolbar tool. null = nur Text-Editieren. */
  activeTool: ChordTool
  /** Akkord-Token, aus dem der "Akkord einfuegen"-Button `[token]` baut. */
  chordBuilder: string
  /** Free-text input for comment / section tools. */
  toolText: string

  /** Text-Snapshots fuer Undo. */
  undoStack: string[]

  setMode: (on: boolean) => void
  setText: (text: string) => void
  /** Setzt Text + optional snapshot in Undo-Stack. */
  applyTextChange: (nextText: string) => void

  setActiveTool: (tool: ChordTool) => void
  setChordBuilder: (token: string) => void
  appendBuilder: (s: string) => void
  backspaceBuilder: () => void
  clearBuilder: () => void
  setToolText: (t: string) => void
  clearToolText: () => void

  undo: () => boolean
  reset: () => void

  updateCho: (docId: number) => Promise<void>
}

const UNDO_LIMIT = 100

export const useChordInput = create<ChordInputState>((set, get) => ({
  mode: false,
  text: '',

  activeTool: null,
  chordBuilder: '',
  toolText: '',

  undoStack: [],

  setMode: (on) => set({ mode: on, activeTool: on ? get().activeTool : null }),
  setText: (text) => set({ text, undoStack: [] }),

  applyTextChange: (nextText) => {
    const s = get()
    if (nextText === s.text) return
    const history = [...s.undoStack, s.text].slice(-UNDO_LIMIT)
    set({ text: nextText, undoStack: history })
  },

  setActiveTool: (tool) => set({ activeTool: tool }),
  setChordBuilder: (token) => set({ chordBuilder: token }),
  appendBuilder: (s) => set((st) => ({ chordBuilder: st.chordBuilder + s })),
  backspaceBuilder: () =>
    set((st) => ({ chordBuilder: st.chordBuilder.slice(0, -1) })),
  clearBuilder: () => set({ chordBuilder: '' }),
  setToolText: (t) => set({ toolText: t }),
  clearToolText: () => set({ toolText: '' }),

  undo: () => {
    const s = get()
    if (s.undoStack.length === 0) return false
    const prev = s.undoStack[s.undoStack.length - 1]
    set({ text: prev, undoStack: s.undoStack.slice(0, -1) })
    return true
  },

  reset: () =>
    set({
      undoStack: [],
      activeTool: null,
      chordBuilder: '',
      toolText: '',
    }),

  updateCho: async (docId) => {
    const { text } = get()
    await api(`/documents/${docId}/content`, {
      method: 'PUT',
      body: { content: text },
    })
  },
}))
