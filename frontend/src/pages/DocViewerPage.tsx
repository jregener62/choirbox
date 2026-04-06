import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Mic } from 'lucide-react'
import { DocumentPanel } from '@/components/ui/DocumentPanel.tsx'
import { useDocumentsStore } from '@/hooks/useDocuments.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { useRecordingStore } from '@/stores/recordingStore'
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

  const { loadedFolder, load, documents, setActive } = useDocumentsStore()

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
        <button className="topbar-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={22} />
        </button>
        <span className="topbar-title">{folderName}</span>
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
      <div className="player-scroll-content">
        <DocumentPanel folderPath={folder} canUpload={canUpload} />
      </div>
    </div>
  )
}
