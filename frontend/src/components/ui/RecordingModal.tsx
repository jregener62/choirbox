import { useState, useRef } from 'react'
import { Mic, Square, Play, Pause, Upload, X, RotateCcw, Check } from 'lucide-react'
import { useRecorder } from '@/hooks/useRecorder'
import { apiUpload } from '@/api/client'
import { formatTime } from '@/utils/formatters'

interface RecordingModalProps {
  targetPath: string
  onClose: () => void
  onUploadComplete: () => void
}

export function RecordingModal({ targetPath, onClose, onUploadComplete }: RecordingModalProps) {
  const {
    state, error, duration, blob, blobUrl,
    fileExtension, startRecording, stopRecording, reset,
  } = useRecorder()

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadDone, setUploadDone] = useState(false)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)

  const handleUpload = async () => {
    if (!blob) return
    setUploading(true)
    setUploadError(null)

    const now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
    const filename = `Aufnahme_${timestamp}.${fileExtension}`

    const formData = new FormData()
    formData.append('file', blob, filename)
    formData.append('target_path', targetPath || '/')

    try {
      await apiUpload('/dropbox/upload', formData)
      setUploadDone(true)
      onUploadComplete()
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    } finally {
      setUploading(false)
    }
  }

  const togglePreview = () => {
    if (!blobUrl) return
    if (!previewAudioRef.current) {
      previewAudioRef.current = new Audio(blobUrl)
      previewAudioRef.current.onended = () => setPreviewPlaying(false)
    }
    if (previewPlaying) {
      previewAudioRef.current.pause()
      setPreviewPlaying(false)
    } else {
      previewAudioRef.current.play()
      setPreviewPlaying(true)
    }
  }

  const handleReRecord = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current = null
    }
    setPreviewPlaying(false)
    setUploadError(null)
    reset()
  }

  const handleClose = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
    }
    onClose()
  }

  return (
    <div className="recording-overlay" onClick={handleClose}>
      <div className="recording-modal" onClick={(e) => e.stopPropagation()}>
        <div className="recording-header">
          <span className="recording-title">Aufnahme</span>
          <button className="player-header-btn" onClick={handleClose}>
            <X size={20} />
          </button>
        </div>

        <div className="recording-path">
          Zielordner: {targetPath || 'Root'}
        </div>

        <div className="recording-content">
          {state === 'idle' && !uploadDone && (
            <>
              <button className="recording-mic-btn" onClick={startRecording}>
                <Mic size={32} />
              </button>
              <div className="recording-hint">Antippen zum Aufnehmen</div>
            </>
          )}

          {state === 'recording' && (
            <>
              <div className="recording-indicator">
                <div className="recording-pulse" />
                <span className="recording-time">{formatTime(duration)}</span>
              </div>
              <button className="recording-stop-btn" onClick={stopRecording}>
                <Square size={24} fill="currentColor" />
              </button>
              <div className="recording-hint">Antippen zum Stoppen</div>
            </>
          )}

          {state === 'stopped' && !uploadDone && (
            <>
              <div className="recording-preview-info">
                Aufnahme: {formatTime(duration)}
              </div>
              <div className="recording-actions">
                <button className="btn btn-secondary recording-action-btn" onClick={togglePreview}>
                  {previewPlaying ? <Pause size={18} /> : <Play size={18} />}
                  <span>{previewPlaying ? 'Pause' : 'Anhören'}</span>
                </button>
                <button className="btn btn-secondary recording-action-btn" onClick={handleReRecord}>
                  <RotateCcw size={18} />
                  <span>Neu</span>
                </button>
                <button
                  className="btn btn-primary recording-action-btn"
                  onClick={handleUpload}
                  disabled={uploading}
                >
                  <Upload size={18} />
                  <span>{uploading ? 'Lädt...' : 'Hochladen'}</span>
                </button>
              </div>
              {uploadError && (
                <div className="recording-error">{uploadError}</div>
              )}
            </>
          )}

          {uploadDone && (
            <>
              <div className="recording-success">
                <Check size={48} />
              </div>
              <div className="recording-hint">Aufnahme hochgeladen!</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleClose}>
                Schliessen
              </button>
            </>
          )}

          {(state === 'error') && (
            <div className="recording-error">
              {error}
              <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={handleReRecord}>
                Erneut versuchen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
