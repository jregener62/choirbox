import { useState, useEffect } from 'react'
import { Plus, PencilLine } from 'lucide-react'
import { api } from '@/api/client.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { ChordInputViewer } from './ChordInputViewer'
import { TextEditViewer } from './TextEditViewer'
import './EditTopbar.css'

interface TextViewerProps {
  docId: number
  originalName: string
  folderPath?: string
  fontSize?: number
  showName?: boolean
  scrollContainerRef?: React.RefObject<HTMLElement | null>
  onChordSheetCreated?: () => void
}

type EditMode = 'chord' | 'text' | null

export function TextViewer({
  docId,
  originalName,
  folderPath,
  fontSize = 16,
  showName = true,
  scrollContainerRef,
  onChordSheetCreated,
}: TextViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState<EditMode>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const userRole = useAuthStore((s) => s.user?.role)
  const canEdit = hasMinRole(userRole ?? 'guest', 'pro-member')

  useEffect(() => {
    let cancelled = false
    async function fetchContent() {
      try {
        const data = await api<{ content: string }>(`/documents/${docId}/content`)
        if (!cancelled) setContent(data.content)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Text konnte nicht geladen werden')
      }
    }
    fetchContent()
    return () => { cancelled = true }
  }, [docId, reloadToken])

  const handleSaveCho = async (cho: string) => {
    if (!folderPath) throw new Error('Ordnerpfad unbekannt')
    const titleBase = originalName.replace(/\.txt$/i, '')
    await api('/documents/paste-text', {
      method: 'POST',
      body: {
        folder_path: folderPath,
        title: titleBase,
        text: cho,
        file_type: 'cho',
      },
    })
    setEditMode(null)
    onChordSheetCreated?.()
  }

  if (error) {
    return (
      <div className="pdf-upload">
        <div className="pdf-upload-text" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      </div>
    )
  }

  if (content === null) {
    return (
      <div className="pdf-upload">
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Text laden...</span>
      </div>
    )
  }

  if (editMode === 'chord') {
    return (
      <ChordInputViewer
        text={content}
        onCreated={folderPath ? handleSaveCho : undefined}
        onCancel={() => setEditMode(null)}
      />
    )
  }

  if (editMode === 'text') {
    return (
      <TextEditViewer
        docId={docId}
        fileType="txt"
        initialContent={content}
        onSaved={() => {
          setEditMode(null)
          setReloadToken((n) => n + 1)
        }}
        onCancel={() => setEditMode(null)}
      />
    )
  }

  return (
    <div className="text-viewer">
      {showName && <div className="text-viewer-name">{originalName}</div>}
      {canEdit && showName && (
        <div className="edit-topbar">
          {folderPath && (
            <button
              type="button"
              className="edit-topbar-btn edit-topbar-btn--chord"
              onClick={() => setEditMode('chord')}
            >
              <Plus size={16} />
              Chordsheet erstellen
            </button>
          )}
          <button
            type="button"
            className="edit-topbar-btn edit-topbar-btn--text"
            onClick={() => setEditMode('text')}
          >
            <PencilLine size={16} />
            Text bearbeiten
          </button>
        </div>
      )}
      <pre
        className="text-viewer-content"
        style={{ fontSize }}
        ref={(el) => {
          if (scrollContainerRef) {
            (scrollContainerRef as React.MutableRefObject<HTMLElement | null>).current = el
          }
        }}
      >
        {content}
      </pre>
    </div>
  )
}
