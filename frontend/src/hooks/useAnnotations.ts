import { create } from 'zustand'
import { api } from '@/api/client.ts'
import type { Stroke, StrokeAnchor } from '@/types/index.ts'

export type AnnotationTool = 'pen' | 'highlighter' | 'eraser' | 'move'

interface AnnotationState {
  drawingMode: boolean
  tool: AnnotationTool
  color: string
  strokeWidth: number
  /** strokes per page, keyed by "docId::page" */
  pages: Record<string, Stroke[]>
  /** currently drawing stroke (not yet committed) */
  activeStroke: Stroke | null
  /** dirty pages waiting for debounced save */
  dirty: Set<string>

  setDrawingMode: (on: boolean) => void
  setTool: (tool: AnnotationTool) => void
  setColor: (color: string) => void
  setStrokeWidth: (width: number) => void
  setActiveStroke: (stroke: Stroke | null) => void
  /** Beim Commit kann optional ein semantischer Anker mitgegeben werden,
   *  der den Stroke an eine Doc-Zeile bindet (siehe StrokeAnchor). */
  commitStroke: (key: string, anchor?: StrokeAnchor) => void
  eraseStroke: (key: string, strokeId: string) => void
  /** Verschiebt einen bestehenden Stroke um (dx, dy) in viewBox-Koordinaten.
   *  Wird vom Move-Tool nach Pointer-Up aufgerufen, triggert debounced save. */
  moveStroke: (key: string, strokeId: string, dx: number, dy: number) => void
  undo: (key: string) => void
  clearPage: (key: string) => void
  loadPage: (docId: number, page: number) => Promise<void>
  savePage: (docId: number, page: number) => Promise<void>
  flushAll: () => Promise<void>
}

function pageKey(docId: number, page: number) {
  return `${docId}::${page}`
}

function parseKey(key: string): { docId: number; page: number } {
  const idx = key.lastIndexOf('::')
  return { docId: parseInt(key.slice(0, idx)), page: parseInt(key.slice(idx + 2)) }
}

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debouncedSave(docId: number, page: number) {
  const key = pageKey(docId, page)
  if (saveTimers[key]) clearTimeout(saveTimers[key])
  saveTimers[key] = setTimeout(() => {
    delete saveTimers[key]
    useAnnotationStore.getState().savePage(docId, page)
  }, 500)
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  drawingMode: false,
  tool: 'pen',
  color: '#ef4444',
  strokeWidth: 4,
  pages: {},
  activeStroke: null,
  dirty: new Set(),

  setDrawingMode: (on) => {
    set({ drawingMode: on })
    if (!on) set({ activeStroke: null })
  },

  setTool: (tool) => set({ tool }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setActiveStroke: (stroke) => set({ activeStroke: stroke }),

  commitStroke: (key, anchor) => {
    const { activeStroke, pages } = get()
    if (!activeStroke || activeStroke.points.length < 2) {
      set({ activeStroke: null })
      return
    }
    const finalStroke: Stroke = anchor ? { ...activeStroke, anchor } : activeStroke
    const existing = pages[key] || []
    const dirty = new Set(get().dirty)
    dirty.add(key)
    set({
      pages: { ...pages, [key]: [...existing, finalStroke] },
      activeStroke: null,
      dirty,
    })
    const { docId, page } = parseKey(key)
    debouncedSave(docId, page)
  },

  eraseStroke: (key, strokeId) => {
    const { pages } = get()
    const existing = pages[key]
    if (!existing) return
    const dirty = new Set(get().dirty)
    dirty.add(key)
    set({
      pages: { ...pages, [key]: existing.filter((s) => s.id !== strokeId) },
      dirty,
    })
    const { docId, page } = parseKey(key)
    debouncedSave(docId, page)
  },

  moveStroke: (key, strokeId, dx, dy) => {
    const { pages } = get()
    const existing = pages[key]
    if (!existing) return
    const updated = existing.map((s) => {
      if (s.id !== strokeId) return s
      return {
        ...s,
        points: s.points.map((p) => [p[0] + dx, p[1] + dy, p[2] ?? 0.5]),
      }
    })
    const dirty = new Set(get().dirty)
    dirty.add(key)
    set({ pages: { ...pages, [key]: updated }, dirty })
    const { docId, page } = parseKey(key)
    debouncedSave(docId, page)
  },

  undo: (key) => {
    const { pages } = get()
    const existing = pages[key]
    if (!existing || existing.length === 0) return
    const dirty = new Set(get().dirty)
    dirty.add(key)
    set({
      pages: { ...pages, [key]: existing.slice(0, -1) },
      dirty,
    })
    const { docId, page } = parseKey(key)
    debouncedSave(docId, page)
  },

  clearPage: (key) => {
    const { pages } = get()
    const dirty = new Set(get().dirty)
    dirty.add(key)
    set({
      pages: { ...pages, [key]: [] },
      dirty,
    })
    const { docId, page } = parseKey(key)
    debouncedSave(docId, page)
  },

  loadPage: async (docId, page) => {
    const key = pageKey(docId, page)
    try {
      const data = await api<{ strokes: Stroke[] }>(
        `/annotations?doc_id=${docId}&page=${page}`,
        { silent: true },
      )
      set((state) => ({
        pages: { ...state.pages, [key]: data.strokes },
      }))
    } catch {
      // Silently fail — page just has no annotations
    }
  },

  savePage: async (docId, page) => {
    const key = pageKey(docId, page)
    const strokes = get().pages[key] || []
    const dirty = new Set(get().dirty)
    dirty.delete(key)
    set({ dirty })
    try {
      await api('/annotations', {
        method: 'PUT',
        body: { doc_id: docId, page, strokes },
        silent: true,
      })
    } catch {
      // Re-mark as dirty on failure
      const d = new Set(get().dirty)
      d.add(key)
      set({ dirty: d })
    }
  },

  flushAll: async () => {
    // Cancel all pending timers and save immediately
    for (const key of Object.keys(saveTimers)) {
      clearTimeout(saveTimers[key])
      delete saveTimers[key]
    }
    const { dirty } = get()
    const promises = Array.from(dirty).map((key) => {
      const { docId, page } = parseKey(key)
      return get().savePage(docId, page)
    })
    await Promise.all(promises)
  },
}))

// Flush on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    useAnnotationStore.getState().flushAll()
  })
}
