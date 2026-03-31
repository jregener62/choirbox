import { create } from 'zustand'
import { api } from '@/api/client.ts'
import type { Stroke } from '@/types/index.ts'

interface AnnotationState {
  drawingMode: boolean
  tool: 'pen' | 'highlighter' | 'eraser'
  color: string
  strokeWidth: number
  /** strokes per page, keyed by "path::page" */
  pages: Record<string, Stroke[]>
  /** currently drawing stroke (not yet committed) */
  activeStroke: Stroke | null
  /** dirty pages waiting for debounced save */
  dirty: Set<string>

  setDrawingMode: (on: boolean) => void
  setTool: (tool: 'pen' | 'highlighter' | 'eraser') => void
  setColor: (color: string) => void
  setStrokeWidth: (width: number) => void
  setActiveStroke: (stroke: Stroke | null) => void
  commitStroke: (key: string) => void
  eraseStroke: (key: string, strokeId: string) => void
  undo: (key: string) => void
  clearPage: (key: string) => void
  loadPage: (path: string, page: number) => Promise<void>
  savePage: (path: string, page: number) => Promise<void>
  flushAll: () => Promise<void>
}

function pageKey(path: string, page: number) {
  return `${path}::${page}`
}

function parseKey(key: string): { path: string; page: number } {
  const idx = key.lastIndexOf('::')
  return { path: key.slice(0, idx), page: parseInt(key.slice(idx + 2)) }
}

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function debouncedSave(path: string, page: number) {
  const key = pageKey(path, page)
  if (saveTimers[key]) clearTimeout(saveTimers[key])
  saveTimers[key] = setTimeout(() => {
    delete saveTimers[key]
    useAnnotationStore.getState().savePage(path, page)
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

  commitStroke: (key) => {
    const { activeStroke, pages } = get()
    if (!activeStroke || activeStroke.points.length < 2) {
      set({ activeStroke: null })
      return
    }
    const existing = pages[key] || []
    const dirty = new Set(get().dirty)
    dirty.add(key)
    set({
      pages: { ...pages, [key]: [...existing, activeStroke] },
      activeStroke: null,
      dirty,
    })
    const { path, page } = parseKey(key)
    debouncedSave(path, page)
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
    const { path, page } = parseKey(key)
    debouncedSave(path, page)
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
    const { path, page } = parseKey(key)
    debouncedSave(path, page)
  },

  clearPage: (key) => {
    const { pages } = get()
    const dirty = new Set(get().dirty)
    dirty.add(key)
    set({
      pages: { ...pages, [key]: [] },
      dirty,
    })
    const { path, page } = parseKey(key)
    debouncedSave(path, page)
  },

  loadPage: async (path, page) => {
    const key = pageKey(path, page)
    try {
      const data = await api<{ strokes: Stroke[] }>(
        `/annotations?path=${encodeURIComponent(path)}&page=${page}`,
        { silent: true },
      )
      set((state) => ({
        pages: { ...state.pages, [key]: data.strokes },
      }))
    } catch {
      // Silently fail — page just has no annotations
    }
  },

  savePage: async (path, page) => {
    const key = pageKey(path, page)
    const strokes = get().pages[key] || []
    const dirty = new Set(get().dirty)
    dirty.delete(key)
    set({ dirty })
    try {
      await api('/annotations', {
        method: 'PUT',
        body: { path, page, strokes },
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
      const { path, page } = parseKey(key)
      return get().savePage(path, page)
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
