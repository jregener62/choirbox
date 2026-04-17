import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, FileX, Mic, SquarePen, X } from 'lucide-react'
import { DocumentPanel } from '@/components/ui/DocumentPanel.tsx'
import { useDocumentsStore } from '@/hooks/useDocuments.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { useRecordingStore } from '@/stores/recordingStore'
import { useOnlineStatus } from '@/hooks/useOnlineStatus.ts'
import { useEditorCommands } from '@/hooks/useEditorCommands'
import { useSheetEditMode } from '@/hooks/useSheetEditMode'
import { hasMinRole } from '@/utils/roles.ts'
import { stripFolderExtension, isReservedName } from '@/utils/folderTypes.ts'

export function DocViewerPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const folder = params.get('folder') || ''
  const docName = params.get('name') || ''
  const userRole = useAuthStore((s) => s.user?.role ?? 'guest')
  const canUpload = hasMinRole(userRole, 'pro-member')
  const pdfFullscreen = usePlayerStore((s) => s.pdfFullscreen)

  const { loadedFolder, load, documents, activeDocId, loading, setActive } = useDocumentsStore()
  const online = useOnlineStatus()

  const startEdit = useSheetEditMode((s) => s.start)
  const activeDoc = documents.find((d) => d.id === activeDocId)
  const canEdit = canUpload && (activeDoc?.file_type === 'cho' || activeDoc?.file_type === 'txt')

  const editorActive = useEditorCommands((s) => s.active)
  const editorSaving = useEditorCommands((s) => s.saving)
  const editorSaveDisabled = useEditorCommands((s) => s.saveDisabled)
  const editorSaveTitle = useEditorCommands((s) => s.saveTitle)
  const editorOnSave = useEditorCommands((s) => s.onSave)
  const editorOnClose = useEditorCommands((s) => s.onClose)

  useEffect(() => {
    if (folder && folder !== loadedFolder) {
      load(folder)
    }
  }, [folder, loadedFolder, load])

  // Auto-select document by name from URL
  useEffect(() => {
    if (docName && documents.length > 0) {
      const match = documents.find((d) => d.original_name === docName)
      if (match) setActive(match.id)
    }
  }, [docName, documents, setActive])

  // Reset fullscreen on unmount
  useEffect(() => {
    return () => { usePlayerStore.getState().setPdfFullscreen(false) }
  }, [])

  const segments = folder.split('/').filter(Boolean)
  const lastSeg = segments[segments.length - 1] || 'Dokumente'
  const folderName = isReservedName(lastSeg) && segments.length >= 2
    ? stripFolderExtension(segments[segments.length - 2])
    : stripFolderExtension(lastSeg)
  const songFolderPath = isReservedName(lastSeg) && segments.length >= 2
    ? '/' + segments.slice(0, -1).join('/')
    : folder

  return (
    <div className="player-page">
      <div className={`topbar${pdfFullscreen ? ' topbar--hidden' : ''}`}>
        <button
          className="topbar-back"
          onClick={editorActive ? editorOnClose : () => navigate(-1)}
          title={editorActive ? 'Bearbeitung abbrechen' : 'Zurück'}
        >
          {editorActive ? <X size={22} /> : <ChevronLeft size={22} />}
        </button>
        <span className="topbar-title">{folderName}</span>
        {editorActive ? (
          <button
            className="topbar-action topbar-action--save"
            onClick={editorOnSave}
            disabled={editorSaveDisabled}
            title={editorSaveTitle}
            aria-busy={editorSaving}
          >
            Speichern
          </button>
        ) : (
          <div className="topbar-actions">
            {canEdit && (
              <button
                className="topbar-action"
                onClick={startEdit}
                title="Bearbeiten"
              >
                <SquarePen size={18} />
              </button>
            )}
            {canUpload && songFolderPath && (
              <button
                className="topbar-action"
                onClick={() => useRecordingStore.getState().startSession(songFolderPath)}
                title="Aufnehmen"
              >
                <Mic size={18} />
              </button>
            )}
          </div>
        )}
      </div>
      <div className="player-scroll-content">
        {(() => {
          const hasDoc = documents.some((d) => d.id === activeDocId)
          const finishedWithoutDoc = !loading && loadedFolder === folder && !hasDoc
          if (finishedWithoutDoc) {
            return (
              <div className="doc-unavailable">
                <FileX size={32} aria-hidden="true" />
                <div className="doc-unavailable-title">Dokument nicht verfuegbar</div>
                <div className="doc-unavailable-hint">
                  {online
                    ? 'Bitte zurueck zum Ordner und erneut versuchen.'
                    : 'Keine Internetverbindung. Bitte zurueck zum Ordner und spaeter erneut versuchen.'}
                </div>
              </div>
            )
          }
          return <DocumentPanel folderPath={folder} />
        })()}
      </div>
    </div>
  )
}
