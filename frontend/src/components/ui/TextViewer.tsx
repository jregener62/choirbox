import { useState, useEffect } from 'react'
import { api } from '@/api/client.ts'

interface TextViewerProps {
  docId: number
  originalName: string
}

export function TextViewer({ docId, originalName }: TextViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <div className="text-viewer">
      <div className="text-viewer-name">{originalName}</div>
      <pre className="text-viewer-content">{content}</pre>
    </div>
  )
}
