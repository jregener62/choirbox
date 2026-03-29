import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Pin, Repeat, X, ChevronLeft, LayoutList } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useWaveform } from '@/hooks/useWaveform.ts'
import { useSectionsStore } from '@/hooks/useSections.ts'
import { useSectionPresetsStore } from '@/hooks/useSectionPresets.ts'
import { SectionCards } from '@/components/ui/SectionCards.tsx'
import { TopPlayerBar } from '@/components/ui/TopPlayerBar.tsx'
import { buildTimeline } from '@/utils/buildTimeline'
import { parseTrackFilename } from '@/utils/parseTrackFilename'
import { voiceColor, voiceBg, voiceFullName } from '@/utils/voiceColors'
import { formatTime, formatDisplayName, middleTruncate } from '@/utils/formatters.ts'
import type { TimelineEntry } from '@/utils/buildTimeline'

const FALLBACK_COLORS = [
  '#f59e0b', '#ef4444', '#3b82f6', '#22c55e',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

export function SectionEditorPage() {
  const navigate = useNavigate()
  const { currentPath, currentName, currentTime, duration, markers, loopStart, loopEnd, loopEnabled } = usePlayerStore()
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

  const folderPath = currentPath.split('/').slice(0, -1).join('/')
  const folderName = folderPath.split('/').filter(Boolean).pop() || ''
  const parsed = currentName ? parseTrackFilename(currentName, folderName) : null
  const timeline = buildTimeline(sections, duration)
  const hasSections = sections.length > 0
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

  const resetForm = () => {
    setEditingId(null)
    setLabel('')
    setColor(FALLBACK_COLORS[0])
    setStartTime(null)
    setEndTime(null)
    usePlayerStore.getState().setSectionLoop(null)
  }

  const handleSectionClick = (entry: TimelineEntry) => {
    if (entry.isGap) return
    const section = sections.find((s) => s.id === entry.id)
    if (!section) return

    const store = usePlayerStore.getState()
    if (editingId === section.id) {
      resetForm()
    } else {
      store.setSectionLoop(section)
      seek(section.start_time)
      setEditingId(section.id)
      setLabel(section.label)
      setColor(section.color)
      setStartTime(section.start_time)
      setEndTime(section.end_time)
    }
  }

  return (
    <div className="player-page">
      {/* Page header — same as PlayerPage */}
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate('/player')}>
          <ChevronLeft size={22} />
        </button>
        <span className="topbar-title">Sektionen</span>
        <div className="topbar-track">
          <span className="topbar-track-name">{middleTruncate(formatDisplayName(currentName!))}</span>
          {parsed && (
            <span
              className="topbar-voice-badge"
              style={{ background: voiceBg(parsed.voiceKey), color: voiceColor(parsed.voiceKey) }}
            >
              {voiceFullName(parsed.voiceKey)}
            </span>
          )}
        </div>
      </div>
      <TopPlayerBar
        variant="full"
        peaks={peaks}
        timeline={timeline}
        markers={markers}
        onSeek={(time) => { seek(time); usePlayerStore.getState().setPlaying(true) }}
      />
      {/* Toolbar — same as PlayerPage */}
      <div className="player-toolbar">
        <button className="player-toolbar-btn" onClick={addMarker}>
          <Pin size={16} />
        </button>
        <button
          className={`player-toolbar-btn player-toolbar-btn--wide ${loopStart !== null ? 'player-toolbar-btn--amber' : ''}`}
          onClick={setA}
        >
          <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>[</span>
          {loopStart !== null && <span className="player-toolbar-btn-time">{formatTime(loopStart)}</span>}
        </button>
        <button
          className={`player-toolbar-btn player-toolbar-btn--narrow ${loopEnabled ? 'player-toolbar-btn--amber' : ''}`}
          onClick={handleLoopTap}
          disabled={loopStart === null || loopEnd === null}
        >
          <Repeat size={16} />
        </button>
        <button
          className={`player-toolbar-btn player-toolbar-btn--wide ${loopEnd !== null ? 'player-toolbar-btn--amber' : ''}`}
          onClick={setB}
        >
          {loopEnd !== null && <span className="player-toolbar-btn-time">{formatTime(loopEnd)}</span>}
          <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>]</span>
        </button>
      </div>
      {/* Marker row — same as PlayerPage */}
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

      {/* Scrollable content */}
      <div className="player-scroll-content">
        {/* Section Cards — click selects for editing */}
        {hasSections && (
          <SectionCards
            timeline={timeline}
            currentTime={currentTime}
            activeSectionId={editingId}
            loopEnabled={loopEnabled}
            loopStart={loopStart}
            loopEnd={loopEnd}
            onSectionClick={handleSectionClick}
          />
        )}

        {/* Hint when no sections exist yet */}
        {!hasSections && (
          <div style={{ padding: '24px 0', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            Setze Marker und erstelle daraus Sektionen
          </div>
        )}
      </div>

      {/* Fixed footer — editing controls */}
      <div className="section-editor-footer">
        {editingId === null ? (
          /* Set Marker + Generate Sections — only when not editing */
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="player-ab-btn"
              style={{ flex: 1, padding: '10px 0', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
              onClick={addMarker}
            >
              <Pin size={18} />
              Setze Marker
            </button>
            <button
              className={`player-ab-btn ${canGenerateSections ? 'active' : ''}`}
              style={{ flex: 1, padding: '10px 0', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: canGenerateSections ? 1 : 0.4 }}
              onClick={generateSections}
              disabled={!canGenerateSections}
            >
              <LayoutList size={18} />
              Erstelle Sektion(en)
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, opacity: canSaveEdit ? 1 : 0.4 }}
                disabled={!canSaveEdit}
                onClick={handleSaveEdit}
              >
                Sektion aktualisieren
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={resetForm}
              >
                Abbrechen
              </button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <button
                className={`player-ab-btn ${startTime !== null ? 'active' : ''}`}
                style={{ flex: 1, padding: '10px 0', fontSize: 13 }}
                onClick={() => setStartTime(currentTime)}
              >
                Start: {startTime !== null ? formatTime(startTime) : '\u2014'}
              </button>
              <button
                className="player-ab-btn"
                style={{ width: 'auto', aspectRatio: '1', alignSelf: 'stretch', padding: 0, flexShrink: 0, color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => { remove(editingId!); resetForm() }}
              >
                <Trash2 size={16} />
              </button>
              <button
                className={`player-ab-btn ${endTime !== null ? 'active' : ''}`}
                style={{ flex: 1, padding: '10px 0', fontSize: 13 }}
                onClick={() => setEndTime(currentTime)}
              >
                Ende: {endTime !== null ? formatTime(endTime) : '\u2014'}
              </button>
            </div>

            {/* Preset bricks */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
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
          </>
        )}
      </div>
    </div>
  )
}
