import { create } from 'zustand'
import { api, apiUpload } from '@/api/client.ts'
import type { PdfInfo } from '@/types/index.ts'

interface PdfState {
  info: PdfInfo | null
  loadedPath: string | null
  loading: boolean
  uploading: boolean

  load: (dropboxPath: string) => Promise<void>
  upload: (dropboxPath: string, file: File) => Promise<void>
  remove: (dropboxPath: string) => Promise<void>
  clear: () => void
}

export const usePdfStore = create<PdfState>((set, get) => ({
  info: null,
  loadedPath: null,
  loading: false,
  uploading: false,

  load: async (dropboxPath: string) => {
    set({ loading: true })
    try {
      const data = await api<PdfInfo>(`/pdf/info?path=${encodeURIComponent(dropboxPath)}`)
      set({ info: data, loadedPath: dropboxPath, loading: false })
    } catch {
      set({ info: null, loadedPath: dropboxPath, loading: false })
    }
  },

  upload: async (dropboxPath: string, file: File) => {
    set({ uploading: true })
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('dropbox_path', dropboxPath)
      await apiUpload('/pdf/upload', formData)
      await get().load(dropboxPath)
    } finally {
      set({ uploading: false })
    }
  },

  remove: async (dropboxPath: string) => {
    await api(`/pdf?path=${encodeURIComponent(dropboxPath)}`, { method: 'DELETE' })
    await get().load(dropboxPath)
  },

  clear: () => set({ info: null, loadedPath: null }),
}))
