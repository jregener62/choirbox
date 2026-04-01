import { useState, useEffect, useRef } from 'react'
import { Upload, X, Check, AlertCircle, Loader, FileAudio, Info } from 'lucide-react'
import { apiUpload } from '@/api/client'
import { useAppStore } from '@/stores/appStore'
import { usePlayerStore } from '@/stores/playerStore'

type FileStatus = 'pending' | 'uploading' | 'done' | 'error'

interface FileEntry {
  file: File
  status: FileStatus
  error?: string
}

interface ImportModalProps {
  files: File[]
  targetPath: string
  isAdmin: boolean
  onClose: () => void
  onUploadComplete: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ImportModal({ files, targetPath, isAdmin, onClose, onUploadComplete }: ImportModalProps) {
  const [entries, setEntries] = useState<FileEntry[]>(
    () => files.map((file) => ({ file, status: 'pending' as const })),
  )
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'done'>('idle')
  const abortRef = useRef(false)

  const setModalOpen = useAppStore((s) => s.setModalOpen)
  useEffect(() => {
    setModalOpen(true)
    usePlayerStore.getState().setPlaying(false)
    return () => setModalOpen(false)
  }, [setModalOpen])

  const doneCount = entries.filter((e) => e.status === 'done').length
  const errorCount = entries.filter((e) => e.status === 'error').length

  const handleUpload = async () => {
    setPhase('uploading')
    abortRef.current = false

    for (let i = 0; i < entries.length; i++) {
      if (abortRef.current) break

      setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: 'uploading' } : e))

      try {
        const formData = new FormData()
        formData.append('file', entries[i].file, entries[i].file.name)
        formData.append('target_path', targetPath || '/')
        await apiUpload('/dropbox/upload', formData)
        setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: 'done' } : e))
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload fehlgeschlagen'
        setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: 'error', error: msg } : e))
      }
    }

    setPhase('done')
    onUploadComplete()
  }

  const handleClose = () => {
    abortRef.current = true
    onClose()
  }

  const statusIcon = (entry: FileEntry) => {
    switch (entry.status) {
      case 'pending': return <FileAudio size={16} className="import-icon-pending" />
      case 'uploading': return <Loader size={16} className="import-icon-uploading" />
      case 'done': return <Check size={16} className="import-icon-done" />
      case 'error': return <AlertCircle size={16} className="import-icon-error" />
    }
  }

  return (
    <div className="recording-overlay" onClick={phase !== 'uploading' ? handleClose : undefined}>
      <div className="recording-modal" onClick={(e) => e.stopPropagation()}>
        <div className="recording-header">
          <span className="recording-title">
            {entries.length === 1 ? 'Datei hochladen' : `${entries.length} Dateien hochladen`}
          </span>
          {phase !== 'uploading' && (
            <button className="player-header-btn" onClick={handleClose}>
              <X size={20} />
            </button>
          )}
        </div>

        <div className="recording-path">
          Zielordner: {targetPath || 'Root'}
        </div>

        <div className="recording-content">
          <div className="import-file-list">
            {entries.map((entry, idx) => (
              <div key={idx} className={`import-file-item import-file-${entry.status}`}>
                {statusIcon(entry)}
                <span className="import-file-name">{entry.file.name}</span>
                <span className="import-file-meta">
                  {entry.status === 'error' ? entry.error : formatSize(entry.file.size)}
                </span>
              </div>
            ))}
          </div>

          {phase !== 'idle' && (
            <div className="import-progress-text">
              {phase === 'uploading'
                ? `${doneCount + errorCount} von ${entries.length} hochgeladen\u2026`
                : errorCount > 0
                  ? `${doneCount} von ${entries.length} erfolgreich hochgeladen`
                  : `${doneCount} ${doneCount === 1 ? 'Datei' : 'Dateien'} erfolgreich hochgeladen`
              }
            </div>
          )}

          {phase === 'done' && (
            <div className="import-hint-box">
              <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                {isAdmin
                  ? 'Tipp: Dateien lassen sich jederzeit per Wisch-Aktion umbenennen.'
                  : 'Tipp: Ein Admin kann hochgeladene Dateien bei Bedarf umbenennen.'
                }
              </span>
            </div>
          )}

          {phase === 'idle' && (
            <button className="btn btn-primary" style={{ gap: 'var(--space-2)', width: '100%' }} onClick={handleUpload}>
              <Upload size={18} />
              Hochladen
            </button>
          )}

          {phase === 'done' && (
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleClose}>
              Schliessen
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
