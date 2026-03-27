import { useState, useEffect, useCallback } from 'react'
import { NotebookPen, Mic, Pencil, Plus } from 'lucide-react'
import { useSectionsNotesStore } from '@/hooks/useSectionsNotes.ts'
import { useSectionsStore } from '@/hooks/useSections.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { formatTime } from '@/utils/formatters.ts'
import type { Section } from '@/types/index.ts'

interface PlayerLyricsProps {
  dropboxPath: string
  currentTime: number
  duration: number
}

interface EditState {
  trackNote: string
  sections: {
    id: number
    label: string
    lyrics: string
    note: string
  }[]
}

export function PlayerLyrics({ dropboxPath, currentTime }: PlayerLyricsProps) {
  const userRole = useAuthStore((s) => s.user?.role ?? 'guest')
  const canEdit = hasMinRole(userRole, 'pro-member')

  const { sections } = useSectionsStore()
  const {
    notes, notesLoadedPath, loading,
    loadNotes, saveLyricsBulk, saveNotesBulk,
    getTrackNote, getSectionNote, getCurrentSection, getNextSection,
  } = useSectionsNotesStore()

  const [editing, setEditing] = useState(false)
  const [editState, setEditState] = useState<EditState | null>(null)

  useEffect(() => {
    if (dropboxPath && notesLoadedPath !== dropboxPath) {
      loadNotes(dropboxPath)
    }
  }, [dropboxPath, notesLoadedPath, loadNotes])

  const currentSection = getCurrentSection(sections, currentTime)
  const nextSection = getNextSection(sections, currentTime)
  const trackNote = getTrackNote()

  const startEdit = useCallback(() => {
    setEditState({
      trackNote: trackNote?.text || '',
      sections: sections.map((s) => ({
        id: s.id,
        label: s.label,
        lyrics: s.lyrics || '',
        note: getSectionNote(s.id)?.text || '',
      })),
    })
    setEditing(true)
  }, [sections, trackNote, getSectionNote])

  const cancelEdit = () => {
    setEditing(false)
    setEditState(null)
  }

  const saveEdit = async () => {
    if (!editState) return

    // Save lyrics on sections (pro-member+)
    await saveLyricsBulk(
      editState.sections.map((s) => ({
        id: s.id,
        lyrics: s.lyrics,
      })),
    )

    // Save notes (track + section)
    const notesPayload: { section_id: number | null; text: string }[] = [
      { section_id: null, text: editState.trackNote },
    ]
    editState.sections.forEach((s) => {
      notesPayload.push({ section_id: s.id, text: s.note })
    })
    await saveNotesBulk(dropboxPath, notesPayload)

    // Reload sections to get updated lyrics
    const { load: loadSections } = useSectionsStore.getState()
    await loadSections(dropboxPath)

    setEditing(false)
    setEditState(null)
  }

  const updateEditSection = (index: number, field: string, value: string) => {
    if (!editState) return
    setEditState({
      ...editState,
      sections: editState.sections.map((s, i) =>
        i === index ? { ...s, [field]: value } : s,
      ),
    })
  }

  if (loading && !notes.length && !sections.length) return null

  // --- Edit Mode ---
  if (editing && editState) {
    return (
      <div className="player-content-area">
        {/* Track-Notizen */}
        <div className="player-panel">
          <div className="player-panel-header">
            <span className="player-panel-icon"><NotebookPen size={16} /></span>
            <span className="player-panel-title">Track-Notizen</span>
            <span className="player-panel-badge">Gesamter Track</span>
          </div>
          <textarea
            className="player-edit-area"
            placeholder="Allgemeine Notizen zum Track..."
            value={editState.trackNote}
            onChange={(e) => setEditState({ ...editState, trackNote: e.target.value })}
          />
        </div>

        {/* Sections */}
        {editState.sections.map((s, i) => (
          <div key={s.id} className="player-section-edit">
            <div className="player-section-edit-header">
              <span style={{ fontWeight: 600 }}>{s.label}</span>
            </div>
            <textarea
              className="player-edit-area player-edit-area--lyrics"
              placeholder="Lyrics..."
              value={s.lyrics}
              onChange={(e) => updateEditSection(i, 'lyrics', e.target.value)}
              style={{ minHeight: 60, marginBottom: 8 }}
            />
            <textarea
              className="player-edit-area"
              placeholder="Notiz..."
              value={s.note}
              onChange={(e) => updateEditSection(i, 'note', e.target.value)}
              style={{ minHeight: 36, fontSize: 12 }}
            />
          </div>
        ))}

        {editState.sections.length === 0 && (
          <div className="player-empty-hint" style={{ marginBottom: 12, cursor: 'default' }}>
            Keine Sektionen vorhanden — zuerst Sektionen anlegen
          </div>
        )}

        {/* Toolbar */}
        <div className="player-edit-toolbar">
          <button className="player-btn-cancel" onClick={cancelEdit}>Abbrechen</button>
          <button className="player-btn-save" onClick={saveEdit}>Speichern</button>
        </div>
      </div>
    )
  }

  // --- No sections and no notes ---
  if (sections.length === 0 && !trackNote) {
    return (
      <div className="player-content-area">
        <div className="player-panel">
          <div className="player-panel-header">
            <span className="player-panel-icon"><NotebookPen size={16} /></span>
            <span className="player-panel-title">Notizen & Lyrics</span>
          </div>
          {canEdit ? (
            <div className="player-empty-hint" onClick={startEdit}>
              <Plus size={16} /> Notizen & Lyrics hinzufuegen
            </div>
          ) : (
            <div className="player-empty-hint" style={{ cursor: 'default' }}>
              Noch keine Notizen oder Lyrics vorhanden
            </div>
          )}
        </div>
      </div>
    )
  }

  // --- Play Mode (read) ---
  return (
    <div className="player-content-area">
      {/* Track-Notizen */}
      <div className="player-panel">
        <div className="player-panel-header">
          <span className="player-panel-icon"><NotebookPen size={16} /></span>
          <span className="player-panel-title">Notizen</span>
          <span className="player-panel-badge">Gesamter Track</span>
        </div>
        {trackNote ? (
          <div className="player-notes-display">{trackNote.text}</div>
        ) : canEdit ? (
          <div className="player-empty-hint" onClick={startEdit}>
            <Plus size={16} /> Notiz hinzufuegen
          </div>
        ) : null}
      </div>

      {/* Lyrics — aktuelle Section */}
      {sections.length > 0 && (
        <div className="player-panel">
          <div className="player-panel-header">
            <span className="player-panel-icon player-panel-icon--lyrics"><Mic size={16} /></span>
            <span className="player-panel-title">Lyrics</span>
            {currentSection && (
              <span className="player-panel-badge">
                <span className="player-eq-bars">
                  <span className="player-eq-bar" />
                  <span className="player-eq-bar" />
                  <span className="player-eq-bar" />
                </span>
                {currentSection.label}
              </span>
            )}
          </div>

          {currentSection ? (
            <SectionCard
              section={currentSection}
              sectionNote={getSectionNote(currentSection.id)}
            />
          ) : (
            <div className="player-section-card" style={{ opacity: 0.5, textAlign: 'center' }}>
              <div className="player-section-lyrics" style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                Keine Section an dieser Position
              </div>
            </div>
          )}

          {nextSection && nextSection.lyrics && (
            <div className="player-next-section">
              <div className="player-next-label">Naechste: {nextSection.label}</div>
              <div className="player-next-lyrics">{nextSection.lyrics}</div>
            </div>
          )}
        </div>
      )}

      {/* Bearbeiten-Button nur fuer pro-member+ */}
      {canEdit && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <button
            className="player-empty-hint"
            onClick={startEdit}
            style={{ padding: '10px 20px', borderStyle: 'solid' }}
          >
            <Pencil size={14} /> Bearbeiten
          </button>
        </div>
      )}
    </div>
  )
}

function SectionCard({ section, sectionNote }: { section: Section; sectionNote?: { text: string } }) {
  return (
    <div className="player-section-card">
      <div className="player-section-header">
        <span className="player-section-name">{section.label}</span>
        <span className="player-section-time">
          {formatTime(section.start_time)} – {formatTime(section.end_time)}
        </span>
      </div>
      {section.lyrics ? (
        <div className="player-section-lyrics">{section.lyrics}</div>
      ) : (
        <div className="player-section-lyrics" style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: 14 }}>
          Keine Lyrics
        </div>
      )}
      {sectionNote && sectionNote.text && (
        <div className="player-section-note">{sectionNote.text}</div>
      )}
    </div>
  )
}
