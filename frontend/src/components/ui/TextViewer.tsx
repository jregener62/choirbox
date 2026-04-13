import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { api } from '@/api/client.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { ChordInputViewer } from './ChordInputViewer'

interface TextViewerProps {
  docId: number
  originalName: string
  folderPath?: string
  fontSize?: number
  showName?: boolean
  scrollContainerRef?: React.RefObject<HTMLElement | null>
  onChordSheetCreated?: () => void
}

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
  const [chordMode, setChordMode] = useState(false)
  const userRole = useAuthStore((s) => s.user?.role)
  const canEditChords = hasMinRole(userRole ?? 'guest', 'pro-member')

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
  }, [docId])

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
    setChordMode(false)
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

  if (chordMode) {
    return (
      <ChordInputViewer
        text={content}
        onCreated={folderPath ? handleSaveCho : undefined}
        onCancel={() => setChordMode(false)}
      />
    )
  }

  return (
    <div className="text-viewer">
      {showName && <div className="text-viewer-name">{originalName}</div>}
      {canEditChords && folderPath && (
        <div style={{ padding: 'var(--space-2) var(--space-3) 0', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ gap: 'var(--space-1)' }}
            onClick={() => setChordMode(true)}
          >
            <Plus size={16} />
            Chordsheet erstellen
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
