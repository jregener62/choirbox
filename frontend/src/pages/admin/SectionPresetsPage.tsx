import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Pencil, Trash2, Plus } from 'lucide-react'
import { api } from '@/api/client.ts'
import type { SectionPreset } from '@/types/index.ts'

const DEFAULT_COLORS = [
  '#f59e0b', '#ef4444', '#3b82f6', '#22c55e',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
]

export function SectionPresetsPage() {
  const [presets, setPresets] = useState<SectionPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_COLORS[0])

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

  const resetForm = () => { setShowForm(false); setEditId(null); setName(''); setColor(DEFAULT_COLORS[0]) }

  const startEdit = (preset: SectionPreset) => {
    setEditId(preset.id); setName(preset.name); setColor(preset.color); setShowForm(true)
  }

  const savePreset = async () => {
    if (!name.trim()) { setMessage('Name ist erforderlich'); return }
    try {
      if (editId) {
        await api(`/section-presets/${editId}`, { method: 'PUT', body: { name: name.trim(), color } })
      } else {
        await api('/section-presets', { method: 'POST', body: { name: name.trim(), color, sort_order: presets.length } })
      }
      resetForm(); loadPresets()
    } catch { setMessage('Fehler beim Speichern') }
  }

  const deletePreset = async (preset: SectionPreset) => {
    if (!confirm(`"${preset.name}" loeschen?`)) return
    try { await api(`/section-presets/${preset.id}`, { method: 'DELETE' }); loadPresets() }
    catch { setMessage('Fehler beim Loeschen') }
  }

  return (
    <div>
      <div className="topbar">
        <button className="player-header-btn" onClick={() => navigate('/settings')}>
          <ArrowLeft size={20} />
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
              <button className="auth-submit" style={{ flex: 1 }} onClick={savePreset}>
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
