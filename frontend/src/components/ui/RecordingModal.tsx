import { useState, useRef, useMemo, useEffect } from 'react'
import { Mic, Square, Play, Pause, Upload, RotateCcw, Check } from 'lucide-react'
import { useRecorder } from '@/hooks/useRecorder'
import { apiUpload } from '@/api/client'
import { Modal } from './Modal'
import { formatTime } from '@/utils/formatters'
import { buildFilename } from '@/utils/filename'
import { useLabelsStore } from '@/hooks/useLabels'
import { useSectionPresetsStore } from '@/hooks/useSectionPresets'
import { stripFolderExtension, isReservedName } from '@/utils/folderTypes'
import type { SelectedSection, VoiceOption, SectionOption } from '@/utils/filename'

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

  const segments = targetPath.split('/').filter(Boolean)
  const lastSegment = segments[segments.length - 1] || ''
  const folderName = isReservedName(lastSegment) && segments.length >= 2
    ? stripFolderExtension(segments[segments.length - 2])
    : stripFolderExtension(lastSegment)
  const [songName, setSongName] = useState(folderName)
  const allLabels = useLabelsStore((s) => s.labels)
  const labelsLoaded = useLabelsStore((s) => s.loaded)
  const loadLabels = useLabelsStore((s) => s.load)
  useEffect(() => { if (!labelsLoaded) loadLabels() }, [labelsLoaded, loadLabels])
  const voiceOptions: VoiceOption[] = allLabels
    .filter((l) => l.category === 'Stimme')
    .map((l) => ({ key: l.shortcode || l.name, label: l.name, sort_order: l.sort_order }))
  const presets = useSectionPresetsStore((s) => s.presets)
  const presetsLoaded = useSectionPresetsStore((s) => s.loaded)
  const loadPresets = useSectionPresetsStore((s) => s.load)
  useEffect(() => { if (!presetsLoaded) loadPresets() }, [presetsLoaded, loadPresets])
  const sectionOptions: SectionOption[] = presets.map((p) => ({
    name: p.name, shortcode: p.shortcode || p.name, max_num: p.max_num, sort_order: p.sort_order,
  }))

  const filename = useMemo(
    () => buildFilename(voices, sections, '', songName, 'mp3', voiceOptions),
    [voices, sections, songName, voiceOptions],
  )

  const toggleVoice = (key: string) => {
    setVoices((prev) =>
      prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key],
    )
  }

  const toggleSection = (opt: SectionOption) => {
    setSections((prev) => {
      const exists = prev.find((s) => s.name === opt.name)
      if (exists) return prev.filter((s) => s.name !== opt.name)
      return [...prev, { name: opt.name, shortcode: opt.shortcode, num: opt.max_num > 0 ? 1 : 0 }]
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

    const ext = fileExtension
    const uploadFilename = filename.replace(/\.mp3$/, `.${ext}`)
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
    <Modal title="Aufnahme" onClose={handleClose}>
      <div className="recording-path" style={{ padding: 0 }}>
        Zielordner: {targetPath || 'Root'}
      </div>

      {state === 'idle' && !uploadDone && (
        <>
          <button className="recording-mic-btn" onClick={startRecording}>
            <Mic size={32} />
          </button>
          <div className="recording-hint">ANTIPPEN ZUM AUFNEHMEN</div>
        </>
      )}

      {state === 'recording' && (
        <>
          <div className="recording-indicator">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <div className="recording-pulse" />
              <span className="recording-indicator-label">AUFNAHME LÄUFT</span>
            </div>
            <span className="recording-time">{formatTime(duration)}</span>
          </div>
          <button className="recording-stop-btn" onClick={stopRecording} aria-label="Stop">
            <Square size={24} fill="currentColor" />
          </button>
          <div className="recording-hint">ANTIPPEN ZUM STOPPEN</div>
        </>
      )}

      {state === 'stopped' && !uploadDone && (
        <>
          <div className="recording-preview-info">
            DAUER · {formatTime(duration)}
          </div>

          {/* Voice selection */}
          <div className="recording-section">
            <div className="recording-section-label">Stimme</div>
            <div className="voice-part-selector">
              <button
                type="button"
                className={`voice-part-btn ${voices.length === 0 ? 'selected' : ''}`}
                onClick={() => setVoices([])}
              >
                Keine
              </button>
              {voiceOptions.map((v) => (
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
              <div className="section-chip-group">
                <button
                  type="button"
                  className={`filter-chip ${sections.length === 0 ? 'active' : ''}`}
                  onClick={() => setSections([])}
                >
                  Keine
                </button>
              </div>
              {sectionOptions.map((s) => {
                const selected = sections.find((sel) => sel.name === s.name)
                return (
                  <div key={s.name} className="section-chip-group">
                    <button
                      type="button"
                      className={`filter-chip ${selected ? 'active' : ''}`}
                      onClick={() => toggleSection(s)}
                    >
                      {s.name}
                    </button>
                    {selected && s.max_num > 0 && (
                      <select
                        className="section-number-select"
                        value={selected.num}
                        onChange={(e) => setSectionNum(s.name, Number(e.target.value))}
                      >
                        {Array.from({ length: s.max_num }, (_, i) => i + 1).map((n) => (
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
            <div className="recording-section-label">Liedname</div>
            <input
              className="input"
              type="text"
              value={songName}
              onChange={(e) => setSongName(e.target.value)}
              placeholder={folderName || 'Liedname'}
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
              <span>{previewPlaying ? 'Pause' : 'Anhoeren'}</span>
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
              <span>{uploading ? 'Laedt...' : 'Hochladen'}</span>
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
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleClose}>
            Schliessen
          </button>
        </>
      )}

      {(state === 'error') && (
        <div className="recording-error">
          {error}
          <button className="btn btn-secondary" style={{ marginTop: 'var(--space-3)' }} onClick={handleReRecord}>
            Erneut versuchen
          </button>
        </div>
      )}
    </Modal>
  )
}
