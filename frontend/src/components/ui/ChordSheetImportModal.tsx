import { useState, useRef, useCallback } from 'react'
import { Upload, AlertCircle, Check } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ChordSheetViewer } from '@/components/ui/ChordSheetViewer'
import { parsePdf, saveChordSheet } from '@/api/chordSheets'
import type { ChordSheetParseResult } from '@/types/index'

interface ChordSheetImportModalProps {
  songFolderPath: string
  onClose: () => void
  onSuccess: () => void
}

type Step = 'upload' | 'parsing' | 'review' | 'saving' | 'error'

export function ChordSheetImportModal({
  songFolderPath,
  onClose,
  onSuccess,
}: ChordSheetImportModalProps) {
  const [step, setStep] = useState<Step>('upload')
  const [parseResult, setParseResult] = useState<ChordSheetParseResult | null>(null)
  const [title, setTitle] = useState('')
  const [originalKey, setOriginalKey] = useState('')
  const [error, setError] = useState('')
  const [filename, setFilename] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Nur PDF-Dateien werden unterstützt.')
      setStep('error')
      return
    }

    setFilename(file.name)
    setStep('parsing')
    setError('')

    try {
      const result = await parsePdf(file)
      setParseResult(result)
      setTitle(result.title)
      setOriginalKey(result.parsed_content.detected_key || '')
      setStep('review')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Fehler beim Parsen des PDFs.',
      )
      setStep('error')
    }
  }, [])

  const handleSave = useCallback(async () => {
    if (!parseResult) return
    setStep('saving')

    try {
      await saveChordSheet({
        folder: songFolderPath,
        title: title.trim() || 'Unbenannt',
        original_key: originalKey,
        parsed_content: parseResult.parsed_content,
        source_filename: filename,
      })
      onSuccess()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Fehler beim Speichern.',
      )
      setStep('error')
    }
  }, [parseResult, songFolderPath, title, originalKey, filename, onSuccess])

  return (
    <Modal title="Akkordblatt importieren" onClose={onClose}>
      {/* Step: Upload */}
      {step === 'upload' && (
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            style={{ display: 'none' }}
            onChange={handleFileSelect}
          />
          <button
            className="chord-sheet-import-btn"
            onClick={() => fileRef.current?.click()}
            style={{ margin: '0 auto', maxWidth: '300px' }}
          >
            <Upload size={24} />
            PDF auswählen
          </button>
          <p style={{
            marginTop: 'var(--space-3)',
            fontSize: 'var(--text-caption)',
            color: 'var(--text-tertiary)',
          }}>
            Unterstützt: Chord-Sheets von Ultimate Guitar und ähnlichen Seiten
          </p>
        </div>
      )}

      {/* Step: Parsing */}
      {step === 'parsing' && (
        <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
          <div className="spinner" style={{ margin: '0 auto var(--space-4)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>
            PDF wird analysiert...
          </p>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            Akkorde und Text werden extrahiert
          </p>
        </div>
      )}

      {/* Step: Review */}
      {step === 'review' && parseResult && (
        <div>
          {/* Edit fields */}
          <div style={{
            display: 'flex',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-3)',
          }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Titel</label>
              <input
                className="form-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Songtitel"
              />
            </div>
            <div style={{ width: '80px' }}>
              <label className="form-label">Tonart</label>
              <input
                className="form-input"
                value={originalKey}
                onChange={(e) => setOriginalKey(e.target.value)}
                placeholder="z.B. E"
              />
            </div>
          </div>

          {/* Info */}
          <div style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            marginBottom: 'var(--space-2)',
            display: 'flex',
            gap: 'var(--space-3)',
          }}>
            <span>{parseResult.parsed_content.sections.length} Sektionen</span>
            <span>{parseResult.parsed_content.all_chords.length} verschiedene Akkorde</span>
            <span>Konfidenz: {Math.round((parseResult.parsed_content.key_confidence || 0) * 100)}%</span>
          </div>

          {/* Preview */}
          <div style={{
            maxHeight: '40vh',
            overflow: 'auto',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
          }}>
            <ChordSheetViewer
              content={parseResult.parsed_content}
              transposition={0}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Abbrechen
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              <Check size={16} /> Speichern
            </button>
          </div>
        </div>
      )}

      {/* Step: Saving */}
      {step === 'saving' && (
        <div style={{ textAlign: 'center', padding: 'var(--space-8) 0' }}>
          <div className="spinner" style={{ margin: '0 auto var(--space-4)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Wird gespeichert...</p>
        </div>
      )}

      {/* Step: Error */}
      {step === 'error' && (
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <AlertCircle size={48} style={{ color: 'var(--danger)', marginBottom: 'var(--space-3)' }} />
          <p style={{ color: 'var(--danger)', marginBottom: 'var(--space-4)' }}>
            {error}
          </p>
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={onClose}>
              Schließen
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setStep('upload')
                setError('')
              }}
            >
              Erneut versuchen
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
