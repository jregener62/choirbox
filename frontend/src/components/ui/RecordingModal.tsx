import { useState, useRef, useMemo } from 'react'
import { Mic, Square, Play, Pause, Upload, X, RotateCcw, Check } from 'lucide-react'
import { useRecorder } from '@/hooks/useRecorder'
import { apiUpload } from '@/api/client'
import { formatTime } from '@/utils/formatters'

const VOICES = [
  { key: 'S', label: 'Sopran' },
  { key: 'A', label: 'Alt' },
  { key: 'T', label: 'Tenor' },
  { key: 'B', label: 'Bass' },
] as const

const SECTIONS = [
  { name: 'Intro', maxNum: 0 },
  { name: 'Strophe', maxNum: 5 },
  { name: 'Refrain', maxNum: 4 },
  { name: 'Bridge', maxNum: 4 },
  { name: 'Outro', maxNum: 0 },
] as const

interface SelectedSection {
  name: string
  num: number // 0 = no number
}

function buildFilename(
  voices: string[],
  sections: SelectedSection[],
  freeText: string,
  folderName: string,
  ext: string,
): string {
  const parts: string[] = []

  const order = ['S', 'A', 'T', 'B']
  const voiceStr = order.filter((v) => voices.includes(v)).join('')
  if (voiceStr) parts.push(voiceStr)

  if (folderName) parts.push(folderName)

  for (const s of sections) {
    parts.push(s.num ? `${s.name}${s.num}` : s.name)
  }

  const clean = freeText
    .trim()
    .replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (clean) parts.push(clean)

  if (parts.length === 0) {
    const now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `Aufnahme_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.${ext}`
  }

  return `${parts.join('-')}.${ext}`
}

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

  // Naming state
  const [voices, setVoices] = useState<string[]>([])
  const [sections, setSections] = useState<SelectedSection[]>([])
  const [freeText, setFreeText] = useState('')

  const folderName = targetPath.split('/').filter(Boolean).pop() || ''

  const filename = useMemo(
    () => buildFilename(voices, sections, freeText, folderName, 'mp3'),
    [voices, sections, freeText, folderName],
  )

  const toggleVoice = (key: string) => {
    setVoices((prev) =>
      prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key],
    )
  }

  const toggleSection = (name: string) => {
    setSections((prev) => {
      const exists = prev.find((s) => s.name === name)
      if (exists) return prev.filter((s) => s.name !== name)
      const def = SECTIONS.find((s) => s.name === name)
      return [...prev, { name, num: def && def.maxNum > 0 ? 1 : 0 }]
    })
  }

  const setSectionNum = (name: string, num: number) => {
    setSections((prev) =>
      prev.map((s) => (s.name === name ? { ...s, num } : s)),
    )
  }

  const handleUpload = async () => {
    if (!blob) return
    setUploading(true)
    setUploadError(null)

    // Upload with original extension so server knows the source format
    const uploadFilename = filename.replace(/\.mp3$/, `.${fileExtension}`)
    const formData = new FormData()
    formData.append('file', blob, uploadFilename)
    formData.append('target_path', targetPath || '/')

    try {
      await apiUpload('/dropbox/upload', formData)
      setUploadDone(true)
      onUploadComplete()
    } catch (err) {
      if (err instanceof TypeError) {
        setUploadError('Keine Internetverbindung')
      } else if (err instanceof Error && 'status' in err) {
        const status = (err as { status: number }).status
        if (status === 413) setUploadError('Datei zu gross (max. 20 MB)')
        else if (status === 500) setUploadError('Konvertierung fehlgeschlagen — bitte erneut versuchen')
        else if (status === 502) setUploadError('Dropbox-Upload fehlgeschlagen — bitte erneut versuchen')
        else setUploadError(err.message || 'Upload fehlgeschlagen')
      } else {
        setUploadError('Upload fehlgeschlagen')
      }
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

              {/* Voice selection */}
              <div className="recording-section">
                <div className="recording-section-label">Stimme</div>
                <div className="voice-part-selector">
                  {VOICES.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      className={`voice-part-btn ${voices.includes(v.key) ? 'selected' : ''}`}
                      onClick={() => toggleVoice(v.key)}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section selection */}
              <div className="recording-section">
                <div className="recording-section-label">Abschnitt</div>
                <div className="section-chips">
                  {SECTIONS.map((s) => {
                    const selected = sections.find((sel) => sel.name === s.name)
                    return (
                      <div key={s.name} className="section-chip-group">
                        <button
                          type="button"
                          className={`filter-chip ${selected ? 'active' : ''}`}
                          onClick={() => toggleSection(s.name)}
                        >
                          {s.name}
                        </button>
                        {selected && s.maxNum > 0 && (
                          <select
                            className="section-number-select"
                            value={selected.num}
                            onChange={(e) => setSectionNum(s.name, Number(e.target.value))}
                          >
                            {Array.from({ length: s.maxNum }, (_, i) => i + 1).map((n) => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Free text */}
              <div className="recording-section">
                <div className="recording-section-label">Notiz (optional)</div>
                <input
                  className="input"
                  type="text"
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  placeholder="z.B. langsam, Durchlauf3..."
                  style={{ fontSize: 14 }}
                />
              </div>

              {/* Filename preview */}
              <div className="recording-filename-preview">
                {filename}
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
