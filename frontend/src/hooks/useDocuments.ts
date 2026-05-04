import { create } from 'zustand'
import { api, apiUpload, isAbortError } from '@/api/client.ts'
import type { DocumentItem, DocumentListResponse } from '@/types/index.ts'

export type DocumentsLoadError =
  | { kind: 'timeout' }
  | { kind: 'network' }
  | { kind: 'unknown'; message: string }

interface DocumentsState {
  documents: DocumentItem[]
  activeDocId: number | null
  loadedFolder: string | null
  loading: boolean
  uploading: boolean
  error: DocumentsLoadError | null

  load: (folderPath: string) => Promise<void>
  retry: () => Promise<void>
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

// Aktiver AbortController fuer den juengsten load()-Aufruf. Beim Folder-
// Wechsel wird der vorherige Controller aborted, damit der alte Request
// nicht das frische Ergebnis mit stale Daten ueberschreibt.
let currentController: AbortController | null = null
let currentFolder: string | null = null

function classifyError(err: unknown): DocumentsLoadError {
  if (err instanceof DOMException && err.name === 'TimeoutError') return { kind: 'timeout' }
  if (err instanceof Error && err.message === 'Netzwerkfehler') return { kind: 'network' }
  if (err instanceof Error) return { kind: 'unknown', message: err.message }
  return { kind: 'unknown', message: 'Unbekannter Fehler' }
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: [],
  activeDocId: null,
  loadedFolder: null,
  loading: false,
  uploading: false,
  error: null,

  load: async (folderPath: string) => {
    const existing = pendingLoads.get(folderPath)
    if (existing) return existing

    // Anderer Folder ist gerade aktiv -> abbrechen, sonst koennte sein
    // spaeteres set() unsere Daten ueberschreiben.
    if (currentController && currentFolder !== folderPath) {
      currentController.abort()
    }

    const controller = new AbortController()
    currentController = controller
    currentFolder = folderPath

    const promise = (async () => {
      const isDifferentFolder = get().loadedFolder !== folderPath
      // Beim Folder-Wechsel die Liste leeren, aber die ggf. vorab gesetzte
      // activeDocId erhalten — die "Neues Chordsheet"-/"Neuer Rich-Text"-
      // Flows setzen sie vor der Navigation, damit beim ersten Render direkt
      // das richtige Dokument aktiv ist und nicht kurz docs[0] durchblitzt.
      const preservedActiveId = get().activeDocId
      set({
        loading: true,
        error: null,
        ...(isDifferentFolder
          ? { documents: [], loadedFolder: null }
          : {}),
      })
      try {
        const data = await api<DocumentListResponse>(
          `/documents/list?folder=${encodeURIComponent(folderPath)}`,
          { signal: controller.signal },
        )
        // Race-Schutz: Wenn waehrend unseres awaits ein neuer Folder gestartet
        // wurde, gehoert das Ergebnis nicht mehr uns — keinen State setzen.
        if (controller.signal.aborted || currentController !== controller) return
        const docs = data.documents
        const activeStillValid = docs.some((d) => d.id === preservedActiveId)
        set({
          documents: docs,
          loadedFolder: folderPath,
          activeDocId: activeStillValid ? preservedActiveId : (docs[0]?.id ?? null),
          loading: false,
          error: null,
        })
      } catch (err) {
        if (isAbortError(err)) return  // Folder-Wechsel hat uns abgebrochen
        if (controller.signal.aborted || currentController !== controller) return
        set({
          documents: [],
          // loadedFolder bewusst NICHT setzen: bleibt null oder auf vorherigem
          // Wert, damit DocViewerPage's useEffect (folder !== loadedFolder)
          // einen Retry erlaubt, sobald der User darauf klickt.
          loading: false,
          error: classifyError(err),
        })
      } finally {
        if (currentController === controller) {
          currentController = null
          currentFolder = null
        }
      }
    })()

    pendingLoads.set(folderPath, promise)
    try {
      await promise
    } finally {
      pendingLoads.delete(folderPath)
    }
  },

  retry: async () => {
    // Nutzt den aktuell *erwarteten* Folder. Falls loadedFolder gesetzt ist
    // (z.B. nach erfolgreichem ersten Load + spaeterem Fehler), retry darauf.
    const folder = currentFolder ?? get().loadedFolder
    if (!folder) return
    await get().load(folder)
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

  clear: () => {
    if (currentController) currentController.abort()
    currentController = null
    currentFolder = null
    set({ documents: [], activeDocId: null, loadedFolder: null, error: null })
  },
}))
