import { create } from 'zustand'

/**
 * Shared editor-action bridge between a mounted editor (SheetEditor,
 * TextEditViewer, ...) and the page-level topbar. The editor registers
 * its Save/Close callbacks on mount and keeps the disabled/saving flags
 * in sync. The topbar reads from this store to render contextual
 * action buttons above the page content.
 */
interface State {
  active: boolean
  saving: boolean
  saveDisabled: boolean
  saveTitle: string
  onSave: () => void
  onClose: () => void

  /** When true, undo/clear are hidden (source/text-edit has its own undo). */
  sourceMode: boolean

  /** Utility actions (undo / clear / preview) rendered in the file-info bar. */
  undoDisabled: boolean
  clearDisabled: boolean
  clearTitle: string
  previewDisabled: boolean
  onUndo: () => void
  onClear: () => void
  onPreview: () => void

  activate: (opts: {
    saving: boolean
    saveDisabled: boolean
    saveTitle: string
    onSave: () => void
    onClose: () => void
    undoDisabled: boolean
    clearDisabled: boolean
    clearTitle: string
    previewDisabled: boolean
    onUndo: () => void
    onClear: () => void
    onPreview: () => void
  }) => void
  update: (opts: Partial<{
    saving: boolean
    saveDisabled: boolean
    saveTitle: string
    undoDisabled: boolean
    clearDisabled: boolean
    clearTitle: string
    previewDisabled: boolean
  }>) => void
  deactivate: () => void
}

const noop = () => { /* noop */ }

export const useEditorCommands = create<State>((set) => ({
  active: false,
  saving: false,
  saveDisabled: true,
  saveTitle: 'Speichern',
  onSave: noop,
  onClose: noop,
  sourceMode: false,
  undoDisabled: true,
  clearDisabled: true,
  clearTitle: 'Löschen',
  previewDisabled: true,
  onUndo: noop,
  onClear: noop,
  onPreview: noop,

  activate: (opts) => set({ active: true, ...opts }),

  update: (opts) => set((s) => ({ ...s, ...opts })),

  deactivate: () =>
    set({
      active: false,
      saving: false,
      saveDisabled: true,
      saveTitle: 'Speichern',
      onSave: noop,
      onClose: noop,
      sourceMode: false,
      undoDisabled: true,
      clearDisabled: true,
      clearTitle: 'Löschen',
      previewDisabled: true,
      onUndo: noop,
      onClear: noop,
      onPreview: noop,
    }),
}))
