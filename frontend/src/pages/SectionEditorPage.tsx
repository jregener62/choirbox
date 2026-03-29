import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Pin, ChevronLeft, LayoutList } from 'lucide-react'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAudioPlayer } from '@/hooks/useAudioPlayer.ts'
import { useWaveform } from '@/hooks/useWaveform.ts'
import { useLoopControls } from '@/hooks/useLoopControls.ts'
import { useSectionsStore } from '@/hooks/useSections.ts'
import { useSectionPresetsStore } from '@/hooks/useSectionPresets.ts'
import { SectionCards } from '@/components/ui/SectionCards.tsx'
import { PlayerControlsBar } from '@/components/ui/PlayerControlsBar.tsx'
import { buildTimeline } from '@/utils/buildTimeline'
import { parseTrackFilename } from '@/utils/parseTrackFilename'
import { voiceColor, voiceBg, voiceFullName } from '@/utils/voiceColors'
import { formatTime, formatDisplayName, middleTruncate } from '@/utils/formatters.ts'
import type { TimelineEntry } from '@/utils/buildTimeline'

// Reservierte Farben ausgeschlossen: Orange #f59e0b (Playback), Lime #84cc16 (Marker), Blau #3b82f6 (Confirm)
const FALLBACK_COLORS = [
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
  '#e879f9', '#f97316', '#06b6d4', '#a855f7',
]

export function SectionEditorPage() {
  const navigate = useNavigate()
  const { currentPath, currentName, currentTime, duration, markers, loopStart, loopEnd, loopEnabled } = usePlayerStore()
  const { seek } = useAudioPlayer()
  const { peaks } = useWaveform(currentPath)
  const { sections, load, create, bulkCreate, update, batchUpdate, remove } = useSectionsStore()
  const { presets, loaded: presetsLoaded, load: loadPresets } = useSectionPresetsStore()

  // Edit form state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingGap, setEditingGap] = useState<TimelineEntry | null>(null)
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

  const { addMarker } = useLoopControls()

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

  const isEditing = editingId !== null || editingGap !== null
  const activeGapIndex = editingGap !== null ? timeline.findIndex(e => e.isGap && e.start_time === editingGap.start_time && e.end_time === editingGap.end_time) : null
  const canSaveEdit = isEditing && label.trim() && startTime !== null && endTime !== null && endTime > startTime

  const handleSaveEdit = async () => {
    if (!canSaveEdit) return
    if (editingGap) {
      await create({
        dropbox_path: currentPath!,
        label: label.trim(),
        color,
        start_time: startTime!,
        end_time: endTime!,
        sort_order: sections.length,
      })
    } else {
      await update(editingId!, { label: label.trim(), color, start_time: startTime!, end_time: endTime! })
    }
    resetForm()
  }

  const resetForm = () => {
    setEditingId(null)
    setEditingGap(null)
    setLabel('')
    setColor(FALLBACK_COLORS[0])
    setStartTime(null)
    setEndTime(null)
    usePlayerStore.getState().setSectionLoop(null)
  }

  const handleSectionClick = (entry: TimelineEntry, _index: number) => {
    const store = usePlayerStore.getState()

    if (entry.isGap) {
      // Toggle gap off if already editing this gap
      if (editingGap && editingGap.start_time === entry.start_time && editingGap.end_time === entry.end_time) {
        resetForm()
        return
      }
      store.setLoopStart(entry.start_time)
      store.setLoopEnd(entry.end_time)
      store.toggleLoop()
      seek(entry.start_time)
      setEditingId(null)
      setEditingGap(entry)
      setLabel(presets[0]?.name ?? 'Sektion')
      setColor(presets[0]?.color ?? FALLBACK_COLORS[0])
      setStartTime(entry.start_time)
      setEndTime(entry.end_time)
      return
    }

    const section = sections.find((s) => s.id === entry.id)
    if (!section) return

    if (editingId === section.id) {
      resetForm()
    } else {
      store.setSectionLoop(section)
      seek(section.start_time)
      setEditingGap(null)
      setEditingId(section.id)
      setLabel(section.label)
      setColor(section.color)
      setStartTime(section.start_time)
      setEndTime(section.end_time)
    }
  }

  const shiftBoundary = async (boundary: 'start' | 'end', delta: number) => {
    const sorted = [...sections].sort((a, b) => a.start_time - b.start_time)

    if (editingGap) {
      // For gaps: just adjust local state, clamped to gap boundaries
      if (boundary === 'start') {
        const newStart = Math.max(0, (startTime ?? 0) + delta)
        if (endTime !== null && endTime - newStart < 1) return
        setStartTime(newStart)
        usePlayerStore.getState().setLoopStart(newStart)
      } else {
        const newEnd = Math.min(duration, (endTime ?? duration) + delta)
        if (startTime !== null && newEnd - startTime < 1) return
        setEndTime(newEnd)
        usePlayerStore.getState().setLoopEnd(newEnd)
      }
      return
    }

    if (editingId === null) return
    const idx = sorted.findIndex(s => s.id === editingId)
    if (idx === -1) return

    // Work on copies to compute cascading changes
    const copies = sorted.map(s => ({ id: s.id, start_time: s.start_time, end_time: s.end_time }))
    const target = copies[idx]

    if (boundary === 'start') {
      const newStart = Math.max(0, target.start_time + delta)
      if (target.end_time - newStart < 1) return
      target.start_time = newStart

      // Cascade backwards when expanding earlier (delta < 0)
      if (delta < 0) {
        for (let i = idx - 1; i >= 0; i--) {
          if (copies[i].end_time <= copies[i + 1].start_time) break
          copies[i].end_time = copies[i + 1].start_time
          if (copies[i].end_time - copies[i].start_time < 1) {
            copies[i].start_time = copies[i].end_time - 1
            if (copies[i].start_time < 0) return // no room, abort
          }
        }
      }
    } else {
      const newEnd = Math.min(duration, target.end_time + delta)
      if (newEnd - target.start_time < 1) return
      target.end_time = newEnd

      // Cascade forwards when expanding later (delta > 0)
      if (delta > 0) {
        for (let i = idx + 1; i < copies.length; i++) {
          if (copies[i].start_time >= copies[i - 1].end_time) break
          copies[i].start_time = copies[i - 1].end_time
          if (copies[i].end_time - copies[i].start_time < 1) {
            copies[i].end_time = copies[i].start_time + 1
            if (copies[i].end_time > duration) return // no room, abort
          }
        }
      }
    }

    // Collect changed sections
    const updates: Array<{ id: number; data: { start_time?: number; end_time?: number } }> = []
    for (let i = 0; i < copies.length; i++) {
      const orig = sorted[i]
      const copy = copies[i]
      const changes: { start_time?: number; end_time?: number } = {}
      if (copy.start_time !== orig.start_time) changes.start_time = copy.start_time
      if (copy.end_time !== orig.end_time) changes.end_time = copy.end_time
      if (Object.keys(changes).length > 0) updates.push({ id: copy.id, data: changes })
    }
    if (updates.length === 0) return

    // Update local state + loop
    setStartTime(copies[idx].start_time)
    setEndTime(copies[idx].end_time)
    const store = usePlayerStore.getState()
    store.setLoopStart(copies[idx].start_time)
    store.setLoopEnd(copies[idx].end_time)

    await batchUpdate(updates)
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
      <PlayerControlsBar peaks={peaks} timeline={timeline} markers={markers} />

      {/* Scrollable content */}
      <div className="player-scroll-content">
        {/* Section Cards — click selects for editing */}
        {hasSections && (
          <SectionCards
            timeline={timeline}
            currentTime={currentTime}
            activeSectionId={editingId}
            activeGapIndex={activeGapIndex}
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
        {!isEditing ? (
          /* Set Marker + Generate Sections — only when not editing */
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="player-ab-btn"
              style={{ flex: 1, padding: '10px 0', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, borderColor: 'var(--marker)', color: 'var(--marker)' }}
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
            {/* 1. Preset bricks — horizontal scrollable */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', overflowX: 'auto', marginBottom: 12, flexWrap: 'nowrap' }}>
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
                      flexShrink: 0,
                    }}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>

            {/* 2. Start / Delete / Ende with +/- shift buttons */}
            <div className="section-boundary-row">
              <button
                className="section-shift-btn"
                onClick={() => shiftBoundary('start', -1)}
                disabled={startTime !== null && startTime <= 0}
              >
                &minus;
              </button>
              <button
                className={`player-ab-btn ${startTime !== null ? 'active' : ''}`}
                style={{ flex: 1, padding: '10px 8px', fontSize: 13 }}
                onClick={() => setStartTime(currentTime)}
              >
                Start: {startTime !== null ? formatTime(startTime) : '\u2014'}
              </button>
              <button
                className="section-shift-btn"
                onClick={() => shiftBoundary('start', 1)}
                disabled={startTime !== null && endTime !== null && endTime - startTime <= 1}
              >
                +
              </button>

              {editingId !== null && (
                <button
                  className="player-ab-btn"
                  style={{ width: 'auto', aspectRatio: '1', alignSelf: 'stretch', padding: 0, flexShrink: 0, color: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={() => { remove(editingId!); resetForm() }}
                >
                  <Trash2 size={16} />
                </button>
              )}

              <button
                className="section-shift-btn"
                onClick={() => shiftBoundary('end', -1)}
                disabled={startTime !== null && endTime !== null && endTime - startTime <= 1}
              >
                &minus;
              </button>
              <button
                className={`player-ab-btn ${endTime !== null ? 'active' : ''}`}
                style={{ flex: 1, padding: '10px 8px', fontSize: 13 }}
                onClick={() => setEndTime(currentTime)}
              >
                Ende: {endTime !== null ? formatTime(endTime) : '\u2014'}
              </button>
              <button
                className="section-shift-btn"
                onClick={() => shiftBoundary('end', 1)}
                disabled={endTime !== null && endTime >= duration}
              >
                +
              </button>
            </div>

            {/* 3. Aktualisieren / Abbrechen */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-primary"
                style={{ flex: 1, opacity: canSaveEdit ? 1 : 0.4 }}
                disabled={!canSaveEdit}
                onClick={handleSaveEdit}
              >
                {editingGap ? 'Sektion erstellen' : 'Sektion aktualisieren'}
              </button>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={resetForm}
              >
                Abbrechen
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
