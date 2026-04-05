import { useState, useRef } from 'react'
import { Upload, Check, AlertCircle, Loader, FileAudio, Info, Film } from 'lucide-react'
import { apiUpload } from '@/api/client'
import { Modal } from './Modal'
import { stripFolderExtension, deriveSongFolderPath } from '@/utils/folderTypes'

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
  songFolderName?: string  // Root-Modus: auto-create .song folder with this name
  onClose: () => void
  onUploadComplete: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function ImportModal({ files, targetPath, isAdmin, songFolderName, onClose, onUploadComplete }: ImportModalProps) {
  const [entries, setEntries] = useState<FileEntry[]>(
    () => files.map((file) => ({ file, status: 'pending' as const })),
  )
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'done'>('idle')
  const abortRef = useRef(false)

  const doneCount = entries.filter((e) => e.status === 'done').length
  const errorCount = entries.filter((e) => e.status === 'error').length

  const handleUpload = async () => {
    setPhase('uploading')
    abortRef.current = false

    for (let i = 0; i < entries.length; i++) {
      if (abortRef.current) break

      setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: 'uploading' } : e))

      try {
        const name = entries[i].file.name.toLowerCase()
        // Always detect by file extension — backend handles routing to correct subfolder
        const isDocument = name.endsWith('.pdf') || name.endsWith('.txt')
        // Use .song parent folder when inside a reserved subfolder (Audio, Texte, etc.)
        const uploadPath = deriveSongFolderPath(targetPath) || targetPath || '/'
        const formData = new FormData()
        formData.append('file', entries[i].file, entries[i].file.name)
        if (isDocument) {
          formData.append('folder_path', uploadPath)
          if (songFolderName) formData.append('song_folder_name', songFolderName)
          await apiUpload('/documents/upload', formData)
        } else {
          formData.append('target_path', uploadPath)
          if (songFolderName) formData.append('song_folder_name', songFolderName)
          await apiUpload('/dropbox/upload', formData)
        }
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

  const isVideo = (name: string) => /\.(mp4|webm|mov)$/i.test(name)

  const statusIcon = (entry: FileEntry) => {
    switch (entry.status) {
      case 'pending': return isVideo(entry.file.name)
        ? <Film size={16} className="import-icon-pending" />
        : <FileAudio size={16} className="import-icon-pending" />
      case 'uploading': return <Loader size={16} className="import-icon-uploading" />
      case 'done': return <Check size={16} className="import-icon-done" />
      case 'error': return <AlertCircle size={16} className="import-icon-error" />
    }
  }

  return (
    <Modal
      title={entries.length === 1 ? 'Datei hochladen' : `${entries.length} Dateien hochladen`}
      onClose={handleClose}
      closeOnOverlay={phase !== 'uploading'}
      showClose={phase !== 'uploading'}
    >
      <div className="recording-path" style={{ padding: 0 }}>
        {songFolderName
          ? `Neuer Song-Ordner: ${songFolderName}.song`
          : `Zielordner: ${targetPath ? stripFolderExtension(targetPath.split('/').filter(Boolean).pop() || '') : 'Root'}`
        }
      </div>

      <div className="import-file-list">
        {entries.map((entry, idx) => (
          <div key={idx} className={`import-file-item import-file-${entry.status}`}>
            {statusIcon(entry)}
            <span className="import-file-name">{entry.file.name}</span>
            <span className="import-file-meta">
              {entry.status === 'error'
                ? entry.error
                : entry.status === 'uploading' && isVideo(entry.file.name)
                  ? 'Wird komprimiert\u2026'
                  : formatSize(entry.file.size)
              }
            </span>
          </div>
        ))}
      </div>

      {phase !== 'idle' && (
        <div className="import-progress-text">
          {phase === 'uploading'
            ? (() => {
                const current = entries.find((e) => e.status === 'uploading')
                const videoProcessing = current && isVideo(current.file.name)
                return videoProcessing
                  ? `Video wird komprimiert und hochgeladen\u2026`
                  : `${doneCount + errorCount} von ${entries.length} hochgeladen\u2026`
              })()
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
              ? 'Tipp: Dateien lassen sich per Wisch-Aktion (Stift-Symbol) umbenennen.'
              : 'Tipp: Ein Admin kann hochgeladene Dateien per Wisch-Aktion umbenennen.'
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
    </Modal>
  )
}
