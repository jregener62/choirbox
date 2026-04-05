import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Mic, Square, Play, Pause, Upload, RotateCcw, Check, X } from 'lucide-react'
import { useRecordingStore } from '@/stores/recordingStore'
import { useRecorder } from '@/hooks/useRecorder'
import { useBrowseStore } from '@/stores/browseStore'
import { apiUpload } from '@/api/client'
import { api } from '@/api/client'
import { formatTime } from '@/utils/formatters'
import { buildAutoRecordingName, generateTimestampSongName } from '@/utils/filename'
import type { BrowseResponse } from '@/types/index'

type Phase = 'idle' | 'recording' | 'stopped' | 'uploading' | 'done' | 'error'

export function FloatingRecorder() {
  const songFolderPath = useRecordingStore((s) => s.songFolderPath)
  const songFolderName = useRecordingStore((s) => s.songFolderName)
  const basePath = useRecordingStore((s) => s.basePath)
  const endSession = useRecordingStore((s) => s.endSession)

  const isRootMode = !songFolderPath && !!basePath
  const isActive = !!songFolderPath || !!basePath

  if (!isActive) return null

  return createPortal(
    <FloatingRecorderInner
      songFolderPath={songFolderPath}
      songFolderName={songFolderName}
      basePath={basePath}
      isRootMode={isRootMode}
      onClose={endSession}
    />,
    document.body,
  )
}

interface InnerProps {
  songFolderPath: string | null
  songFolderName: string | null
  basePath: string | null
  isRootMode: boolean
  onClose: () => void
}

function FloatingRecorderInner({ songFolderPath, songFolderName, basePath, isRootMode, onClose }: InnerProps) {
  const {
    state: recState, error: recError, duration, blob,
    blobUrl, fileExtension, startRecording, stopRecording, reset,
  } = useRecorder()

  const [phase, setPhase] = useState<Phase>('idle')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const previewRef = useRef<HTMLAudioElement | null>(null)

  // Sync recorder state to phase
  useEffect(() => {
    if (recState === 'recording') setPhase('recording')
    else if (recState === 'stopped' && phase === 'recording') setPhase('stopped')
    else if (recState === 'error') setPhase('error')
  }, [recState, phase])

  const handleClose = useCallback(() => {
    if (previewRef.current) previewRef.current.pause()
    if (recState === 'recording') stopRecording()
    reset()
    onClose()
  }, [recState, stopRecording, reset, onClose])

  const handleReRecord = () => {
    if (previewRef.current) {
      previewRef.current.pause()
      previewRef.current = null
    }
    setPreviewPlaying(false)
    setUploadError(null)
    reset()
    setPhase('idle')
  }

  const togglePreview = () => {
    if (!blobUrl) return
    if (!previewRef.current) {
      previewRef.current = new Audio(blobUrl)
      previewRef.current.onended = () => setPreviewPlaying(false)
    }
    if (previewPlaying) {
      previewRef.current.pause()
      setPreviewPlaying(false)
    } else {
      previewRef.current.play()
      setPreviewPlaying(true)
    }
  }

  const handleUpload = async () => {
    if (!blob) return
    setPhase('uploading')
    setUploadError(null)

    try {
      let uploadFilename: string

      if (isRootMode) {
        // Root mode: create .song folder via song_folder_name parameter
        const timestampName = generateTimestampSongName()
        uploadFilename = `${timestampName}-Aufnahme 1.${fileExtension}`

        const formData = new FormData()
        formData.append('file', blob, uploadFilename)
        formData.append('target_path', basePath || '/')
        formData.append('song_folder_name', timestampName)

        await apiUpload('/dropbox/upload', formData)

        // Invalidate and reload browse cache for the base path
        const path = basePath || '/'
        useBrowseStore.getState().invalidate(path)
        useBrowseStore.getState().loadFolder(path, true)
      } else {
        // Song mode: upload into existing .song folder
        let existingFiles: string[] = []
        try {
          const audioPath = `${songFolderPath}/Audio`
          const data = await api<BrowseResponse>(`/dropbox/browse?path=${encodeURIComponent(audioPath)}`)
          existingFiles = data.entries.map((e) => e.name)
        } catch {
          // /Audio folder may not exist yet
        }

        const baseName = buildAutoRecordingName(songFolderName!, existingFiles)
        uploadFilename = `${baseName}.${fileExtension}`

        const formData = new FormData()
        formData.append('file', blob, uploadFilename)
        formData.append('target_path', songFolderPath!)

        await apiUpload('/dropbox/upload', formData)

        useBrowseStore.getState().invalidate(`${songFolderPath}/Audio`)
        useBrowseStore.getState().invalidate(songFolderPath!)
        useBrowseStore.getState().loadFolder(songFolderPath!, true)
      }

      setPhase('done')
      setTimeout(() => {
        reset()
        onClose()
      }, 2000)
    } catch (err) {
      setPhase('error')
      if (err instanceof TypeError) {
        setUploadError('Keine Internetverbindung')
      } else if (err instanceof Error && 'status' in err) {
        const status = (err as { status: number }).status
        if (status === 413) setUploadError('Datei zu gross (max. 20 MB)')
        else if (status === 500) setUploadError('Konvertierung fehlgeschlagen')
        else if (status === 502) setUploadError('Dropbox-Upload fehlgeschlagen')
        else setUploadError(err.message || 'Upload fehlgeschlagen')
      } else {
        setUploadError('Upload fehlgeschlagen')
      }
    }
  }

  const displayName = isRootMode ? 'Neue Aufnahme' : songFolderName

  return (
    <div className="floating-recorder">
      {/* Header row: song name + close */}
      <div className="floating-recorder__header">
        <span className="floating-recorder__name">{displayName}</span>
        {phase !== 'uploading' && phase !== 'done' && (
          <button className="floating-recorder__close" onClick={handleClose}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Idle: start recording */}
      {phase === 'idle' && (
        <div className="floating-recorder__row">
          <button className="floating-recorder__mic" onClick={startRecording}>
            <Mic size={20} />
            <span>Aufnahme starten</span>
          </button>
        </div>
      )}

      {/* Recording: pulse + timer + stop */}
      {phase === 'recording' && (
        <div className="floating-recorder__row">
          <div className="recording-pulse" />
          <span className="floating-recorder__time">{formatTime(duration)}</span>
          <button className="floating-recorder__stop" onClick={stopRecording}>
            <Square size={16} fill="currentColor" />
          </button>
        </div>
      )}

      {/* Stopped: preview + re-record + upload */}
      {phase === 'stopped' && (
        <div className="floating-recorder__row">
          <span className="floating-recorder__time">{formatTime(duration)}</span>
          <div className="floating-recorder__actions">
            <button className="floating-recorder__btn" onClick={togglePreview} title={previewPlaying ? 'Pause' : 'Anhoeren'}>
              {previewPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button className="floating-recorder__btn" onClick={handleReRecord} title="Neu aufnehmen">
              <RotateCcw size={16} />
            </button>
            <button className="floating-recorder__btn floating-recorder__btn--primary" onClick={handleUpload} title="Hochladen">
              <Upload size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Uploading */}
      {phase === 'uploading' && (
        <div className="floating-recorder__row">
          <div className="floating-recorder__spinner" />
          <span>Laedt hoch...</span>
        </div>
      )}

      {/* Done */}
      {phase === 'done' && (
        <div className="floating-recorder__row floating-recorder__row--success">
          <Check size={20} />
          <span>Hochgeladen!</span>
        </div>
      )}

      {/* Error */}
      {phase === 'error' && (
        <div className="floating-recorder__error">
          <span>{uploadError || recError || 'Fehler'}</span>
          <button className="floating-recorder__btn" onClick={handleReRecord}>
            <RotateCcw size={14} />
            <span>Erneut</span>
          </button>
        </div>
      )}
    </div>
  )
}
