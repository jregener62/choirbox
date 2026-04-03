import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2, Plus } from 'lucide-react'
import { api } from '@/api/client.ts'
import { useSectionPresetsStore } from '@/hooks/useSectionPresets.ts'
import type { SectionPreset } from '@/types/index.ts'

// Reservierte Farben ausgeschlossen: Orange #f59e0b (Playback), Lime #84cc16 (Marker), Blau #3b82f6 (Confirm)
// Reserviert/gesperrt: #22d3ee/#06b6d4 (Playback Cyan), #f59e0b (Loop), #84cc16 (Marker)
const DEFAULT_COLORS = [
  '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6',
  '#e879f9', '#f97316', '#a855f7',
]

export function SectionPresetsPage() {
  const [presets, setPresets] = useState<SectionPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [shortcode, setShortcode] = useState('')
  const [maxNum, setMaxNum] = useState(0)
  const [color, setColor] = useState(DEFAULT_COLORS[0])

  const invalidateStore = useSectionPresetsStore((s) => s.invalidate)

  const loadPresets = useCallback(async () => {
    try {
      const data = await api<SectionPreset[]>('/section-presets')
      setPresets(data)
    } catch {
      setMessage('Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPresets() }, [loadPresets])

  const resetForm = () => { setShowForm(false); setEditId(null); setName(''); setShortcode(''); setMaxNum(0); setColor(DEFAULT_COLORS[0]) }

  const startEdit = (preset: SectionPreset) => {
    setEditId(preset.id); setName(preset.name); setShortcode(preset.shortcode || ''); setMaxNum(preset.max_num); setColor(preset.color); setShowForm(true)
  }

  const savePreset = async () => {
    if (!name.trim()) { setMessage('Name ist erforderlich'); return }
    try {
      const sc = shortcode.trim() || name.trim()
      if (editId) {
        await api(`/section-presets/${editId}`, { method: 'PUT', body: { name: name.trim(), color, shortcode: sc, max_num: maxNum } })
      } else {
        await api('/section-presets', { method: 'POST', body: { name: name.trim(), color, shortcode: sc, max_num: maxNum, sort_order: presets.length } })
      }
      resetForm(); loadPresets(); invalidateStore()
    } catch { setMessage('Fehler beim Speichern') }
  }

  const deletePreset = async (preset: SectionPreset) => {
    if (!confirm(`"${preset.name}" loeschen?`)) return
    try { await api(`/section-presets/${preset.id}`, { method: 'DELETE' }); loadPresets(); invalidateStore() }
    catch { setMessage('Fehler beim Loeschen') }
  }

  return (
    <div>
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate('/settings')}>
          <ChevronLeft size={22} />
        </button>
        <div className="topbar-title">Sektionsvorlagen</div>
        <button className="player-header-btn" onClick={() => setShowForm(true)}>
          <Plus size={20} />
        </button>
      </div>

      {message && (
        <div style={{ padding: '10px 16px', background: 'var(--bg-tertiary)', fontSize: 13 }}
          onClick={() => setMessage('')}>{message}</div>
      )}

      {showForm && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="auth-field">
              <label className="auth-label">Name</label>
              <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Intro, Refrain" />
            </div>
            <div className="auth-field">
              <label className="auth-label">Kuerzel im Dateinamen</label>
              <input className="auth-input" value={shortcode} onChange={(e) => setShortcode(e.target.value)} placeholder={name || 'z.B. Str, Ref, Intro'} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Wird im Dateinamen verwendet (z.B. S-Lied-<strong>{shortcode || name || 'Intro'}</strong>.mp3)
              </div>
            </div>
            <div className="auth-field">
              <label className="auth-label">Maximale Nummerierung</label>
              <select className="auth-input" value={maxNum} onChange={(e) => setMaxNum(Number(e.target.value))} style={{ width: 'auto' }}>
                <option value={0}>Keine (z.B. Intro)</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={n}>1–{n} (z.B. Strophe1–{n})</option>
                ))}
              </select>
            </div>
            <div className="auth-field">
              <label className="auth-label">Farbe</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DEFAULT_COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)}
                    style={{
                      width: 36, height: 36, borderRadius: 8, background: c, cursor: 'pointer',
                      border: c === color ? '3px solid var(--text-primary)' : '2px solid transparent',
                    }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={savePreset}>
                {editId ? 'Aktualisieren' : 'Erstellen'}
              </button>
              <button className="btn btn-secondary" onClick={resetForm}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="empty-state">Laden...</div>}

      <ul className="file-list">
        {presets.map((preset) => (
          <li key={preset.id} className="file-item" style={{ cursor: 'default' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: preset.color, flexShrink: 0 }} />
            <div className="file-info">
              <div className="file-name">{preset.name}</div>
              <div className="file-meta">
                {preset.shortcode && preset.shortcode !== preset.name && (
                  <span>Kuerzel: {preset.shortcode}</span>
                )}
                {preset.max_num > 0 && (
                  <span>1–{preset.max_num}</span>
                )}
              </div>
            </div>
            <button className="player-header-btn" onClick={() => startEdit(preset)}>
              <Pencil size={15} />
            </button>
            <button className="player-header-btn" onClick={() => deletePreset(preset)} style={{ color: 'var(--danger)' }}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
