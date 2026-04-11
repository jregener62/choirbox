import { create } from 'zustand'
import { api } from '@/api/client.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { useDocumentsStore } from '@/hooks/useDocuments.ts'
import { isGuest } from '@/utils/roles.ts'
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

// Guests: keep the "selected document per folder" in sessionStorage only.
// The server endpoint (player.state) is blocked for role=guest, and the
// shared guest user would otherwise have cross-session state leakage.
const GUEST_STORAGE_PREFIX = 'choirbox_guest_selected_doc_'

function readGuestSelection(folderPath: string): number | null {
  try {
    const raw = sessionStorage.getItem(`${GUEST_STORAGE_PREFIX}${folderPath}`)
    if (!raw) return null
    const parsed = parseInt(raw, 10)
    return Number.isNaN(parsed) ? null : parsed
  } catch {
    return null
  }
}

function writeGuestSelection(folderPath: string, docId: number): void {
  try {
    sessionStorage.setItem(`${GUEST_STORAGE_PREFIX}${folderPath}`, String(docId))
  } catch {
    /* sessionStorage unavailable — ignore */
  }
}

function clearGuestSelection(folderPath: string): void {
  try {
    sessionStorage.removeItem(`${GUEST_STORAGE_PREFIX}${folderPath}`)
  } catch {
    /* ignore */
  }
}

function currentUserIsGuest(): boolean {
  return isGuest(useAuthStore.getState().user?.role)
}

function docFromDocumentsStore(docId: number): DocumentItem | null {
  const docs = useDocumentsStore.getState().documents
  return docs.find((d) => d.id === docId) ?? null
}

export const useSelectedDocumentStore = create<SelectedDocumentState>((set, get) => ({
  selectedDoc: null,
  loadedFolder: null,
  loading: false,

  loadSelected: async (folderPath: string) => {
    set({ loading: true })

    if (currentUserIsGuest()) {
      const docId = readGuestSelection(folderPath)
      const doc = docId != null ? docFromDocumentsStore(docId) : null
      set({ selectedDoc: doc, loadedFolder: folderPath, loading: false })
      return
    }

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
    if (currentUserIsGuest()) {
      writeGuestSelection(folderPath, docId)
      const doc = docFromDocumentsStore(docId)
      set({ selectedDoc: doc, loadedFolder: folderPath })
      return
    }

    await api('/documents/select', {
      method: 'POST',
      body: { folder_path: folderPath, document_id: docId },
    })
    await get().loadSelected(folderPath)
  },

  deselect: async (folderPath: string) => {
    if (currentUserIsGuest()) {
      clearGuestSelection(folderPath)
      set({ selectedDoc: null })
      return
    }

    await api(`/documents/select?folder=${encodeURIComponent(folderPath)}`, {
      method: 'DELETE',
    })
    set({ selectedDoc: null })
  },

  clear: () => set({ selectedDoc: null, loadedFolder: null }),
}))
