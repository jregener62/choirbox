import { create } from 'zustand'
import { api } from '@/api/client.ts'
import type { DocumentItem } from '@/types/index.ts'

interface SelectedDocumentState {
  selectedDoc: DocumentItem | null
  loadedFolder: string | null
  loading: boolean

  loadSelected: (folderPath: string) => Promise<void>
  select: (folderPath: string, docId: number) => Promise<void>
  deselect: (folderPath: string) => Promise<void>
  clear: () => void
}

export const useSelectedDocumentStore = create<SelectedDocumentState>((set, get) => ({
  selectedDoc: null,
  loadedFolder: null,
  loading: false,

  loadSelected: async (folderPath: string) => {
    set({ loading: true })
    try {
      const data = await api<{ document: DocumentItem | null }>(
        `/documents/selected?folder=${encodeURIComponent(folderPath)}`
      )
      set({ selectedDoc: data.document, loadedFolder: folderPath, loading: false })
    } catch {
      set({ selectedDoc: null, loadedFolder: folderPath, loading: false })
    }
  },

  select: async (folderPath: string, docId: number) => {
    await api('/documents/select', {
      method: 'POST',
      body: { folder_path: folderPath, document_id: docId },
    })
    await get().loadSelected(folderPath)
  },

  deselect: async (folderPath: string) => {
    await api(`/documents/select?folder=${encodeURIComponent(folderPath)}`, {
      method: 'DELETE',
    })
    set({ selectedDoc: null })
  },

  clear: () => set({ selectedDoc: null, loadedFolder: null }),
}))
