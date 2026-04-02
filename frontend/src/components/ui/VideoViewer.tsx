import { useState, useEffect } from 'react'
import { api } from '@/api/client.ts'

interface VideoViewerProps {
  docId: number
  originalName: string
}

export function VideoViewer({ docId, originalName }: VideoViewerProps) {
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchLink() {
      try {
        const data = await api<{ link: string }>(`/documents/${docId}/stream`)
        if (!cancelled) setLink(data.link)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Video konnte nicht geladen werden')
      }
    }
    fetchLink()
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

  if (!link) {
    return (
      <div className="pdf-upload">
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Video laden...</span>
      </div>
    )
  }

  return (
    <div className="video-viewer">
      <div className="video-viewer-name">{originalName}</div>
      <video
        className="video-viewer-player"
        src={link}
        controls
        playsInline
        preload="metadata"
      />
    </div>
  )
}
