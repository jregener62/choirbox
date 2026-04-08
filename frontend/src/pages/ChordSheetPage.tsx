import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, MoreVertical, Trash2 } from 'lucide-react'
import { ChordSheetViewer } from '@/components/ui/ChordSheetViewer'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { getChordSheet, saveTransposition, deleteChordSheet } from '@/api/chordSheets'
import { transposeKey, getTranspositionLabel } from '@/utils/chordTransposer'
import { useAuthStore } from '@/stores/authStore'
import { hasMinRole } from '@/utils/roles'
import type { ChordSheet } from '@/types/index'
import '@/components/ui/ChordSheetViewer.css'

export function ChordSheetPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sheetId = Number(searchParams.get('id'))
  const backPath = searchParams.get('back') || '/browse'

  const [sheet, setSheet] = useState<ChordSheet | null>(null)
  const [transposition, setTransposition] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const userRole = useAuthStore((s) => s.user?.role ?? 'guest')
  const canEdit = hasMinRole(userRole, 'pro-member')

  useEffect(() => {
    if (!sheetId) return
    getChordSheet(sheetId)
      .then((data) => {
        setSheet(data)
        setTransposition(data.user_transposition || 0)
      })
      .catch(() => setError('Chord Sheet konnte nicht geladen werden.'))
  }, [sheetId])

  const handleTranspose = useCallback((delta: number) => {
    setTransposition((prev) => {
      const next = prev + delta
      if (next < -12 || next > 12) return prev
      return next
    })
    setSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    if (!sheet) return
    setSaving(true)
    try {
      await saveTransposition(sheet.id, transposition)
      setSaved(true)
    } catch {
      // Silently fail, user can retry
    } finally {
      setSaving(false)
    }
  }, [sheet, transposition])

  const handleDelete = useCallback(async () => {
    if (!sheet) return
    try {
      await deleteChordSheet(sheet.id)
      navigate(backPath, { replace: true })
    } catch {
      setError('Löschen fehlgeschlagen.')
    }
  }, [sheet, navigate, backPath])

  if (error) {
    return (
      <div className="chord-sheet-empty">
        <p>{error}</p>
        <button className="btn btn-primary" onClick={() => navigate(backPath)}>
          Zurück
        </button>
      </div>
    )
  }

  if (!sheet) {
    return <div className="chord-sheet-empty"><p>Laden...</p></div>
  }

  const originalKey = sheet.original_key || sheet.parsed_content.detected_key || '?'
  const currentKey = transposeKey(originalKey, transposition)

  return (
    <div className="page-content">
      {/* Header */}
      <div className="chord-sheet-header">
        <button className="btn-icon back-btn" onClick={() => navigate(backPath)}>
          <ChevronLeft size={24} />
        </button>
        <div className="chord-sheet-title">{sheet.title}</div>
        {canEdit && (
          <div style={{ position: 'relative' }}>
            <button className="btn-icon" onClick={() => setShowMenu(!showMenu)}>
              <MoreVertical size={20} />
            </button>
            {showMenu && (
              <div
                className="dropdown-menu"
                style={{ position: 'absolute', right: 0, top: '100%', zIndex: 100 }}
              >
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setShowMenu(false)
                    setConfirmDelete(true)
                  }}
                >
                  <Trash2 size={16} /> Löschen
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Transpose Controls */}
      <div className="transpose-controls">
        <button className="transpose-btn" onClick={() => handleTranspose(-1)}>
          −
        </button>
        <div className="transpose-info">
          <span className="transpose-key">{currentKey}</span>
          {transposition !== 0 && (
            <span>{getTranspositionLabel(originalKey, transposition)}</span>
          )}
          {saved && <span className="transpose-saved">✓ gespeichert</span>}
        </div>
        <button className="transpose-btn" onClick={() => handleTranspose(1)}>
          +
        </button>
        {transposition !== (sheet.user_transposition || 0) && (
          <button
            className="btn btn-primary"
            style={{ fontSize: 'var(--text-xs)', padding: 'var(--space-1) var(--space-2)' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '...' : 'Speichern'}
          </button>
        )}
      </div>

      {/* Chord Sheet Content */}
      <ChordSheetViewer content={sheet.parsed_content} transposition={transposition} />

      {/* Delete Confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          title="Chord Sheet löschen"
          hint={`„${sheet.title}" wirklich löschen?`}
          confirmLabel="Löschen"
          variant="danger"
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}
