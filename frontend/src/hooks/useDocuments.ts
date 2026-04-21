import { create } from 'zustand'
import { api, apiUpload } from '@/api/client.ts'
import type { DocumentItem, DocumentListResponse } from '@/types/index.ts'

interface DocumentsState {
  documents: DocumentItem[]
  activeDocId: number | null
  loadedFolder: string | null
  loading: boolean
  uploading: boolean

  load: (folderPath: string) => Promise<void>
  upload: (folderPath: string, file: File) => Promise<void>
  remove: (docId: number) => Promise<void>
  rename: (docId: number, newName: string) => Promise<void>
  setActive: (docId: number) => void
  clear: () => void
}

// Dedupe paralleler load()-Aufrufe fuer denselben Ordner. Ohne Dedupe feuert
// der Backend-Sync zwei parallele INSERTs mit derselben dropbox_file_id, einer
// kippt mit UNIQUE constraint und vergiftet die Session.
const pendingLoads = new Map<string, Promise<void>>()

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: [],
  activeDocId: null,
  loadedFolder: null,
  loading: false,
  uploading: false,

  load: async (folderPath: string) => {
    const existing = pendingLoads.get(folderPath)
    if (existing) return existing

    const promise = (async () => {
      const isDifferentFolder = get().loadedFolder !== folderPath
      set({
        loading: true,
        ...(isDifferentFolder
          ? { documents: [], loadedFolder: null, activeDocId: null }
          : {}),
      })
      try {
        const data = await api<DocumentListResponse>(
          `/documents/list?folder=${encodeURIComponent(folderPath)}`
        )
        const docs = data.documents
        const current = get().activeDocId
        const activeStillValid = docs.some((d) => d.id === current)
        set({
          documents: docs,
          loadedFolder: folderPath,
          activeDocId: activeStillValid ? current : (docs[0]?.id ?? null),
          loading: false,
        })
      } catch {
        set({ documents: [], loadedFolder: folderPath, loading: false })
      }
    })()

    pendingLoads.set(folderPath, promise)
    try {
      await promise
    } finally {
      pendingLoads.delete(folderPath)
    }
  },

  upload: async (folderPath: string, file: File) => {
    set({ uploading: true })
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder_path', folderPath)
      await apiUpload('/documents/upload', formData)
      await get().load(folderPath)
    } finally {
      set({ uploading: false })
    }
  },

  remove: async (docId: number) => {
    await api(`/documents/${docId}`, { method: 'DELETE' })
    const folder = get().loadedFolder
    if (folder) await get().load(folder)
  },

  rename: async (docId: number, newName: string) => {
    await api(`/documents/${docId}/rename`, { method: 'POST', body: { new_name: newName } })
    const folder = get().loadedFolder
    if (folder) await get().load(folder)
  },

  setActive: (docId: number) => set({ activeDocId: docId }),

  clear: () => set({ documents: [], activeDocId: null, loadedFolder: null }),
}))
