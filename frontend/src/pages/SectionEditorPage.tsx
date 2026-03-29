import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Pin, ArrowLeftToLine, ArrowRightToLine, Repeat, X, ChevronLeft, LayoutList } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useWaveform } from '@/hooks/useWaveform.ts'
import { useSectionsStore } from '@/hooks/useSections.ts'
import { useSectionPresetsStore } from '@/hooks/useSectionPresets.ts'
import { Waveform } from '@/components/ui/Waveform.tsx'
import { SectionLane } from '@/components/ui/SectionLane.tsx'
import { TopPlayerBar } from '@/components/ui/TopPlayerBar.tsx'
import { formatTime, formatDisplayName } from '@/utils/formatters.ts'

const FALLBACK_COLORS = [
  '#f59e0b', '#ef4444', '#3b82f6', '#22c55e',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

export function SectionEditorPage() {
  const navigate = useNavigate()
  const { currentPath, currentName, currentTime, duration, markers, loopStart, loopEnd, loopEnabled, activeSection } = usePlayerStore()
  const { seek } = useAudioPlayer()
  const { peaks } = useWaveform(currentPath)
  const { sections, load, bulkCreate, update, remove } = useSectionsStore()
  const { presets, loaded: presetsLoaded, load: loadPresets } = useSectionPresetsStore()

  // Edit form state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(FALLBACK_COLORS[0])
  const [startTime, setStartTime] = useState<number | null>(null)
  const [endTime, setEndTime] = useState<number | null>(null)

  useEffect(() => {
    if (currentPath) load(currentPath)
  }, [currentPath, load])

  useEffect(() => {
    if (!presetsLoaded) loadPresets()
  }, [presetsLoaded, loadPresets])


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
    const newSections = sorted.slice(0, -1).map((m, i) => {
      const preset = presets[i % presets.length]
      return {
        label: preset ? preset.name : `Sektion ${i + 1}`,
        color: preset ? preset.color : FALLBACK_COLORS[i % FALLBACK_COLORS.length],
        start_time: m.time,
        end_time: sorted[i + 1].time,
        sort_order: i,
      }
    })
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
    setColor(FALLBACK_COLORS[0])
    setStartTime(null)
    setEndTime(null)
    usePlayerStore.getState().setSectionLoop(null)
  }

  return (
    <div className="player-page">
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={22} />
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

            {/* Preset bricks for renaming */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {presets.map((p) => {
                const isActive = label === p.name && color === p.color
                return (
                  <button
                    key={p.id}
                    onClick={() => { setLabel(p.name); setColor(p.color) }}
                    style={{
                      padding: '10px 18px',
                      borderRadius: 10,
                      fontSize: 14,
                      fontWeight: 600,
                      background: isActive ? p.color : p.color + '25',
                      color: isActive ? '#fff' : p.color,
                      border: isActive ? `2px solid ${p.color}` : '2px solid transparent',
                      cursor: 'pointer',
                      minWidth: 80,
                      textAlign: 'center',
                    }}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>

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
              <button
                className="player-ab-btn"
                style={{ width: 44, height: 44, padding: 0, flexShrink: 0, color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => { remove(editingId!); resetForm() }}
              >
                <Trash2 size={16} />
              </button>
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

      </div>
    </div>
  )
}
