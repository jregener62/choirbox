import { useState, useEffect } from 'react'
import { api } from '@/api/client.ts'
import { Modal } from './Modal'
import { formatDisplayName } from '@/utils/formatters'

interface VideoModalProps {
  path: string
  name: string
  onClose: () => void
}

export function VideoModal({ path, name, onClose }: VideoModalProps) {
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchLink() {
      try {
        const data = await api<{ link: string }>(`/dropbox/stream?path=${encodeURIComponent(path)}`)
        if (!cancelled) setLink(data.link)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Video konnte nicht geladen werden')
      }
    }
    fetchLink()
    return () => { cancelled = true }
  }, [path])

  return (
    <Modal title={formatDisplayName(name)} onClose={onClose}>
      {error ? (
        <div style={{ color: 'var(--danger)', textAlign: 'center', padding: 'var(--space-4)' }}>
          {error}
        </div>
      ) : !link ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          Video laden...
        </div>
      ) : (
        <video
          src={link}
          controls
          autoPlay
          playsInline
          preload="metadata"
          style={{ width: '100%', borderRadius: 'var(--radius-md)', maxHeight: '70vh' }}
        />
      )}
    </Modal>
  )
}
