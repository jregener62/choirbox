import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Pin, ArrowLeftToLine, ArrowRightToLine, Repeat, X, ChevronDown, LayoutList } from 'lucide-react'
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
  const { sections, load, bulkCreate, update, remove } = useSectionsStore()

  // Edit form state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [startTime, setStartTime] = useState<number | null>(null)
  const [endTime, setEndTime] = useState<number | null>(null)

  useEffect(() => {
    if (currentPath) load(currentPath)
  }, [currentPath, load])


  if (!currentPath) {
    navigate('/', { replace: true })
    return null
  }

  const setA = () => usePlayerStore.getState().setLoopStart(currentTime)
  const setB = () => usePlayerStore.getState().setLoopEnd(currentTime)
  const addMarker = () => usePlayerStore.getState().addMarker(currentTime)

  const loopTapTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const loopLastTap = useRef(0)
  const handleLoopTap = useCallback(() => {
    const now = Date.now()
    if (now - loopLastTap.current < 300) {
      clearTimeout(loopTapTimer.current)
      usePlayerStore.getState().clearLoop()
    } else {
      loopTapTimer.current = setTimeout(() => {
        usePlayerStore.getState().toggleLoop()
      }, 300)
    }
    loopLastTap.current = now
  }, [])

  const canGenerateSections = markers.length >= 2

  const generateSections = async () => {
    if (!canGenerateSections) return
    const sorted = [...markers].sort((a, b) => a.time - b.time)
    const newSections = sorted.slice(0, -1).map((m, i) => ({
      label: `Sektion ${i + 1}`,
      color: PRESET_COLORS[i % PRESET_COLORS.length],
      start_time: m.time,
      end_time: sorted[i + 1].time,
      sort_order: i,
    }))
    await bulkCreate({ dropbox_path: currentPath!, sections: newSections })
    usePlayerStore.getState().clearMarkers()
  }

  const canSaveEdit = editingId !== null && label.trim() && startTime !== null && endTime !== null && endTime > startTime

  const handleSaveEdit = async () => {
    if (!canSaveEdit) return
    await update(editingId!, { label: label.trim(), color, start_time: startTime!, end_time: endTime! })
    resetForm()
  }

  const handleSelect = (s: typeof sections[0]) => {
    const store = usePlayerStore.getState()
    if (store.activeSection?.id === s.id) {
      store.setSectionLoop(null)
      resetForm()
    } else {
      store.setSectionLoop(s)
      seek(s.start_time)
      setEditingId(s.id)
      setLabel(s.label)
      setColor(s.color)
      setStartTime(s.start_time)
      setEndTime(s.end_time)
    }
  }

  const resetForm = () => {
    setEditingId(null)
    setLabel('')
    setColor(PRESET_COLORS[0])
    setStartTime(null)
    setEndTime(null)
    usePlayerStore.getState().setSectionLoop(null)
  }

  return (
    <div className="player-page">
      <div className="topbar">
        <button className="top-player-back" onClick={() => navigate(-1)}>
          <ChevronDown size={22} />
        </button>
        <span className="topbar-title">Sektionen</span>
      </div>
      <TopPlayerBar variant="full" />
      <div className="player-toolbar">
        <button
          className={`player-toolbar-btn ${canGenerateSections ? 'player-toolbar-btn--accent' : ''}`}
          onClick={generateSections}
          disabled={!canGenerateSections}
          title="Sektionen aus Markern erstellen"
        >
          <LayoutList size={16} />
        </button>
        <button className="player-toolbar-btn" onClick={addMarker}>
          <Pin size={16} />
        </button>
        <button
          className={`player-toolbar-btn ${loopStart !== null ? 'player-toolbar-btn--amber' : ''}`}
          onClick={setA}
        >
          <ArrowLeftToLine size={16} />
        </button>
        <button
          className={`player-toolbar-btn ${loopEnabled ? 'player-toolbar-btn--amber' : ''}`}
          onClick={handleLoopTap}
          disabled={loopStart === null || loopEnd === null}
        >
          <Repeat size={16} />
        </button>
        <button
          className={`player-toolbar-btn ${loopEnd !== null ? 'player-toolbar-btn--amber' : ''}`}
          onClick={setB}
        >
          <ArrowRightToLine size={16} />
        </button>
      </div>
      {markers.length > 0 && (
        <div className="player-marker-row">
          {markers.map((m) => (
            <button key={m.id} className="player-toolbar-marker" onClick={() => seek(m.time)}>
              <span className="marker-dot" />
              {formatTime(m.time)}
              <span className="player-toolbar-marker-x" onClick={(e) => { e.stopPropagation(); usePlayerStore.getState().removeMarker(m.id) }}>
                <X size={10} />
              </span>
            </button>
          ))}
          <button className="player-toolbar-btn" onClick={() => usePlayerStore.getState().clearMarkers()} title="Alle Marker loeschen">
            <Trash2 size={14} />
          </button>
        </div>
      )}

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
          onSectionClick={handleSelect}
        />

        {/* Edit form — only when editing an existing section */}
        {editingId !== null && (
          <>
            <div className="player-divider" />

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

            <button
              className="btn btn-primary"
              style={{ width: '100%', marginBottom: 12, opacity: canSaveEdit ? 1 : 0.4 }}
              disabled={!canSaveEdit}
              onClick={handleSaveEdit}
            >
              Sektion aktualisieren
            </button>
            <button
              className="btn btn-secondary"
              style={{ width: '100%', marginBottom: 12 }}
              onClick={resetForm}
            >
              Abbrechen
            </button>
          </>
        )}

        {/* Existing sections list */}
        {sections.length > 0 && (
          <>
            <div className="player-divider" />
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
                Sektionen ({sections.length})
              </div>
              {sections.map((s) => {
                const isSelected = activeSection?.id === s.id
                return (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 6px',
                      borderBottom: '1px solid var(--border)',
                      borderRadius: 6,
                      background: isSelected ? s.color + '20' : 'transparent',
                      borderLeft: isSelected ? `3px solid ${s.color}` : '3px solid transparent',
                      cursor: 'pointer',
                    }}
                    onClick={() => handleSelect(s)}
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
                    <span
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        color: isSelected ? s.color : 'var(--text)',
                        fontSize: 13,
                        fontWeight: isSelected ? 600 : 500,
                      }}
                    >
                      {s.label}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatTime(s.start_time)} – {formatTime(s.end_time)}
                    </span>
                    <button
                      className="marker-chip-remove"
                      onClick={(e) => { e.stopPropagation(); remove(s.id) }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
