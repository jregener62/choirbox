import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useWaveform } from '@/hooks/useWaveform.ts'
import { useSectionsStore } from '@/hooks/useSections.ts'
import { Waveform } from '@/components/ui/Waveform.tsx'
import { SectionLane } from '@/components/ui/SectionLane.tsx'
import { TopPlayerBar } from '@/components/ui/TopPlayerBar.tsx'
import { formatTime, formatDisplayName } from '@/utils/formatters.ts'

const PRESET_LABELS = ['Intro', 'Strophe', 'Refrain', 'Bridge', 'Solo', 'Outro']

const PRESET_COLORS = [
  '#f59e0b', '#ef4444', '#3b82f6', '#22c55e',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

export function SectionEditorPage() {
  const navigate = useNavigate()
  const { currentPath, currentName, currentTime, duration, markers, loopStart, loopEnd, loopEnabled, activeSection } = usePlayerStore()
  const { seek } = useAudioPlayer()
  const { peaks } = useWaveform(currentPath)
  const { sections, load, create, update, remove } = useSectionsStore()

  const [label, setLabel] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [startTime, setStartTime] = useState<number | null>(null)
  const [endTime, setEndTime] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)

  useEffect(() => {
    if (currentPath) load(currentPath)
  }, [currentPath, load])

  if (!currentPath) {
    navigate('/', { replace: true })
    return null
  }

  const canSave = label.trim() && startTime !== null && endTime !== null && endTime > startTime

  const handleSave = async () => {
    if (!canSave) return
    if (editingId !== null) {
      await update(editingId, { label: label.trim(), color, start_time: startTime!, end_time: endTime! })
    } else {
      await create({
        dropbox_path: currentPath!,
        label: label.trim(),
        color,
        start_time: startTime!,
        end_time: endTime!,
        sort_order: sections.length,
      })
    }
    resetForm()
  }

  const handleEdit = (s: typeof sections[0]) => {
    setEditingId(s.id)
    setLabel(s.label)
    setColor(s.color)
    setStartTime(s.start_time)
    setEndTime(s.end_time)
  }

  const resetForm = () => {
    setEditingId(null)
    setLabel('')
    setColor(PRESET_COLORS[0])
    setStartTime(null)
    setEndTime(null)
  }

  return (
    <div className="player-page">
      <TopPlayerBar variant="full" onBack={() => navigate(-1)} title="Sektionen bearbeiten" />

      <div className="player-scroll-content">
        {/* Track name */}
        <div className="player-track-info">
          <div className="player-track-name" style={{ fontSize: 14 }}>{formatDisplayName(currentName!)}</div>
        </div>

        {/* Waveform + Section Lane */}
        <Waveform
          peaks={peaks}
          currentTime={currentTime}
          duration={duration}
          loopStart={loopStart}
          loopEnd={loopEnd}
          loopEnabled={loopEnabled}
          markers={markers}
          activeSectionId={activeSection?.id ?? null}
          onSeek={seek}
        />
        <SectionLane
          sections={sections}
          duration={duration}
          activeSectionId={activeSection?.id ?? null}
          onSectionClick={(s) => {
            const store = usePlayerStore.getState()
            if (store.activeSection?.id === s.id) {
              store.setSectionLoop(null)
            } else {
              store.setSectionLoop(s)
              seek(s.start_time)
            }
          }}
        />

        <div className="player-divider" />

        {/* Start/End buttons */}
        <div style={{ display: 'flex', gap: 10, margin: '0 0 12px' }}>
          <button
            className={`player-ab-btn ${startTime !== null ? 'active' : ''}`}
            style={{ flex: 1, padding: '10px 0', fontSize: 13 }}
            onClick={() => setStartTime(currentTime)}
          >
            Start: {startTime !== null ? formatTime(startTime) : '—'}
          </button>
          <button
            className={`player-ab-btn ${endTime !== null ? 'active' : ''}`}
            style={{ flex: 1, padding: '10px 0', fontSize: 13 }}
            onClick={() => setEndTime(currentTime)}
          >
            Ende: {endTime !== null ? formatTime(endTime) : '—'}
          </button>
        </div>

        {/* Label input + Presets */}
        <input
          className="auth-input"
          type="text"
          placeholder="Sektionsname..."
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {PRESET_LABELS.map((p) => (
            <button
              key={p}
              className="label-chip-sm"
              style={{
                background: label === p ? 'var(--accent)' : 'var(--surface)',
                color: label === p ? '#fff' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
              }}
              onClick={() => setLabel(p)}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Color picker */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: c,
                border: color === c ? '2px solid #fff' : '2px solid transparent',
                boxShadow: color === c ? `0 0 0 2px ${c}` : 'none',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            />
          ))}
        </div>

        {/* Save button */}
        <button
          className="btn btn-primary"
          style={{ width: '100%', marginBottom: 12, opacity: canSave ? 1 : 0.4 }}
          disabled={!canSave}
          onClick={handleSave}
        >
          {editingId !== null ? 'Sektion aktualisieren' : 'Sektion speichern'}
        </button>
        {editingId !== null && (
          <button
            className="btn btn-secondary"
            style={{ width: '100%', marginBottom: 12 }}
            onClick={resetForm}
          >
            Abbrechen
          </button>
        )}

        <div className="player-divider" />

        {/* Existing sections list */}
        {sections.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
              Sektionen ({sections.length})
            </div>
            {sections.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    background: s.color,
                    flexShrink: 0,
                  }}
                />
                <button
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                  onClick={() => handleEdit(s)}
                >
                  {s.label}
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {formatTime(s.start_time)} – {formatTime(s.end_time)}
                </span>
                <button
                  className="marker-chip-remove"
                  onClick={() => remove(s.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
