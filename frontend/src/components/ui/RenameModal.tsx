import { useState, useMemo } from 'react'
import { Check, Save } from 'lucide-react'
import { api } from '@/api/client'
import { Modal } from './Modal'
import { VOICES, SECTIONS, buildFilename } from '@/utils/filename'
import type { SelectedSection } from '@/utils/filename'

interface RenameModalProps {
  path: string
  currentName: string
  folderPath: string
  onClose: () => void
  onRenamed: () => void
}

export function RenameModal({ path, currentName, folderPath, onClose, onRenamed }: RenameModalProps) {
  const ext = currentName.split('.').pop() || 'mp3'
  const folderName = folderPath.split('/').filter(Boolean).pop() || ''

  const [voices, setVoices] = useState<string[]>([])
  const [sections, setSections] = useState<SelectedSection[]>([])
  const [freeText, setFreeText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const filename = useMemo(
    () => buildFilename(voices, sections, freeText, folderName, ext),
    [voices, sections, freeText, folderName, ext],
  )

  const toggleVoice = (key: string) => {
    setVoices((prev) => prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key])
  }

  const toggleSection = (name: string) => {
    setSections((prev) => {
      const exists = prev.find((s) => s.name === name)
      if (exists) return prev.filter((s) => s.name !== name)
      return [...prev, { name, num: 1 }]
    })
  }

  const setSectionNum = (name: string, num: number) => {
    setSections((prev) =>
      prev.map((s) => (s.name === name ? { ...s, num } : s)),
    )
  }

  const handleRename = async () => {
    if (saving || filename === currentName) return
    setSaving(true)
    setError(null)
    try {
      await api('/dropbox/rename', { method: 'POST', body: { path, new_name: filename } })
      setDone(true)
      onRenamed()
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        const status = (err as { status: number }).status
        if (status === 409) setError('Name bereits vergeben')
        else setError(err.message || 'Umbenennen fehlgeschlagen')
      } else {
        setError('Umbenennen fehlgeschlagen')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Datei umbenennen" onClose={onClose}>
      <div className="recording-path" style={{ padding: 0 }}>
        {currentName}
      </div>

      {done ? (
        <>
          <div className="recording-success">
            <Check size={48} />
          </div>
          <div className="recording-hint">Datei umbenannt!</div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>
            Schliessen
          </button>
        </>
      ) : (
        <>
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

          <button
            className="btn btn-primary"
            style={{ gap: 'var(--space-2)', width: '100%' }}
            onClick={handleRename}
            disabled={saving || filename === currentName}
          >
            <Save size={18} />
            {saving ? 'Speichern...' : 'Umbenennen'}
          </button>
          {error && (
            <div className="recording-error">{error}</div>
          )}
        </>
      )}
    </Modal>
  )
}
