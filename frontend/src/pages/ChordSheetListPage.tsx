import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Music, Upload } from 'lucide-react'
import { listChordSheets } from '@/api/chordSheets'
import { ChordSheetImportModal } from '@/components/ui/ChordSheetImportModal'
import { useAuthStore } from '@/stores/authStore'
import { hasMinRole } from '@/utils/roles'
import type { ChordSheet } from '@/types/index'
import '@/components/ui/ChordSheetViewer.css'

export function ChordSheetListPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const folder = searchParams.get('folder') || ''
  const backPath = searchParams.get('back') || '/browse'

  const [sheets, setSheets] = useState<ChordSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)

  const userRole = useAuthStore((s) => s.user?.role ?? 'guest')
  const canImport = hasMinRole(userRole, 'pro-member')

  const loadSheets = useCallback(async () => {
    if (!folder) return
    setLoading(true)
    try {
      const data = await listChordSheets(folder)
      setSheets(data)
    } catch {
      // Ignore
    } finally {
      setLoading(false)
    }
  }, [folder])

  useEffect(() => {
    loadSheets()
  }, [loadSheets])

  const handleSheetClick = (sheet: ChordSheet) => {
    const back = encodeURIComponent(
      `/chord-sheets?folder=${encodeURIComponent(folder)}&back=${encodeURIComponent(backPath)}`,
    )
    navigate(`/chord-sheet?id=${sheet.id}&back=${back}`)
  }

  const handleImportSuccess = () => {
    setShowImport(false)
    loadSheets()
  }

  return (
    <div className="page-content">
      {/* Header */}
      <div className="chord-sheet-header">
        <button className="btn-icon back-btn" onClick={() => navigate(backPath)}>
          <ChevronLeft size={24} />
        </button>
        <div className="chord-sheet-title">Akkorde</div>
      </div>

      {/* List */}
      <div className="chord-sheet-list">
        {canImport && (
          <button className="chord-sheet-import-btn" onClick={() => setShowImport(true)}>
            <Upload size={18} />
            PDF importieren
          </button>
        )}

        {loading && <div className="chord-sheet-empty"><p>Laden...</p></div>}

        {!loading && sheets.length === 0 && (
          <div className="chord-sheet-empty">
            <Music size={48} strokeWidth={1} />
            <p>Noch keine Akkordblätter vorhanden.</p>
            {canImport && (
              <p style={{ fontSize: 'var(--text-caption)' }}>
                Importiere ein PDF mit Akkorden über den Button oben.
              </p>
            )}
          </div>
        )}

        {sheets.map((sheet) => (
          <div
            key={sheet.id}
            className="chord-sheet-list-item"
            onClick={() => handleSheetClick(sheet)}
          >
            <Music size={24} className="chord-sheet-list-item-icon" />
            <div className="chord-sheet-list-item-info">
              <div className="chord-sheet-list-item-title">{sheet.title}</div>
              <div className="chord-sheet-list-item-meta">
                {sheet.original_key && `Tonart: ${sheet.original_key}`}
                {sheet.user_transposition !== 0 &&
                  ` · Deine Transposition: ${sheet.user_transposition > 0 ? '+' : ''}${sheet.user_transposition}`}
              </div>
            </div>
            <ChevronLeft
              size={20}
              style={{ transform: 'rotate(180deg)', color: 'var(--text-tertiary)' }}
            />
          </div>
        ))}
      </div>

      {/* Import Modal */}
      {showImport && (
        <ChordSheetImportModal
          songFolderPath={folder}
          onClose={() => setShowImport(false)}
          onSuccess={handleImportSuccess}
        />
      )}
    </div>
  )
}
