import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Mic } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { useRecordingStore } from '@/stores/recordingStore'
import { useSelectedDocumentStore } from '@/hooks/useSelectedDocument.ts'
import { DocumentPanel } from '@/components/ui/DocumentPanel.tsx'
import { hasMinRole } from '@/utils/roles.ts'
import { isReservedName } from '@/utils/folderTypes.ts'

export function ViewerPage() {
  const navigate = useNavigate()
  const { selectedDoc, loadedFolder, loadSelected } = useSelectedDocumentStore()
  const pdfFullscreen = usePlayerStore((s) => s.pdfFullscreen)
  const currentPath = usePlayerStore((s) => s.currentPath)
  const user = useAuthStore((s) => s.user)
  const isProMember = hasMinRole(user?.role ?? 'guest', 'pro-member')

  // Derive the .song folder path from the current track
  const folderPath = currentPath ? currentPath.split('/').slice(0, -1).join('/') : ''
  const pathSegments = folderPath.split('/').filter(Boolean)
  const lastSegment = pathSegments[pathSegments.length - 1] || ''
  const songFolderPath = isReservedName(lastSegment) && pathSegments.length >= 2
    ? '/' + pathSegments.slice(0, -1).join('/')
    : folderPath

  useEffect(() => {
    if (songFolderPath && songFolderPath !== loadedFolder) loadSelected(songFolderPath)
  }, [songFolderPath, loadedFolder, loadSelected])

  useEffect(() => {
    return () => { usePlayerStore.getState().setPdfFullscreen(false) }
  }, [])

  return (
    <div className="viewer-page">
      <div className={`topbar${pdfFullscreen ? ' topbar--hidden' : ''}`}>
        <button className="topbar-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={22} />
        </button>
        <span className="topbar-title">Viewer</span>
        {isProMember && songFolderPath && (
          <button
            className="topbar-action"
            onClick={() => useRecordingStore.getState().startSession(songFolderPath)}
            title="Aufnehmen"
          >
            <Mic size={18} />
          </button>
        )}
      </div>
      <div className="viewer-content">
        {selectedDoc ? (
          <DocumentPanel folderPath={songFolderPath} document={selectedDoc} emptyHint="Text im Texte-Ordner auswaehlen" />
        ) : (
          <div className="viewer-empty">
            <span>Kein Dokument ausgewaehlt</span>
          </div>
        )}
      </div>
    </div>
  )
}
