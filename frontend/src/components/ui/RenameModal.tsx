import { useState, useMemo, useEffect } from 'react'
import { Check, Save } from 'lucide-react'
import { api } from '@/api/client'
import { Modal } from './Modal'
import { buildFilename } from '@/utils/filename'
import { useLabelsStore } from '@/hooks/useLabels'
import { useSectionPresetsStore } from '@/hooks/useSectionPresets'
import type { SelectedSection, VoiceOption, SectionOption } from '@/utils/filename'

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
  const voiceLabels = useLabelsStore((s) => s.voiceLabels)()
  const voiceOptions: VoiceOption[] = voiceLabels
    .filter((l) => l.shortcode)
    .map((l) => ({ key: l.shortcode!, label: l.name, sort_order: l.sort_order }))
  const presets = useSectionPresetsStore((s) => s.presets)
  const presetsLoaded = useSectionPresetsStore((s) => s.loaded)
  const loadPresets = useSectionPresetsStore((s) => s.load)
  useEffect(() => { if (!presetsLoaded) loadPresets() }, [presetsLoaded, loadPresets])
  const sectionOptions: SectionOption[] = presets.map((p) => ({
    name: p.name, shortcode: p.shortcode || p.name, max_num: p.max_num, sort_order: p.sort_order,
  }))

  const [voices, setVoices] = useState<string[]>([])
  const [sections, setSections] = useState<SelectedSection[]>([])
  const [freeText, setFreeText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const filename = useMemo(
    () => buildFilename(voices, sections, freeText, folderName, ext, voiceOptions),
    [voices, sections, freeText, folderName, ext, voiceOptions],
  )

  const toggleVoice = (key: string) => {
    setVoices((prev) => prev.includes(key) ? prev.filter((v) => v !== key) : [...prev, key])
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
