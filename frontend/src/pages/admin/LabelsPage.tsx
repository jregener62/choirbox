import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Pencil, Trash2, Plus } from 'lucide-react'
import { api } from '@/api/client.ts'
import type { Label } from '@/types/index.ts'

const DEFAULT_COLORS = [
  '#ec4899', '#f97316', '#3b82f6', '#22c55e',
  '#ef4444', '#10b981', '#8b5cf6', '#f59e0b',
]

export function LabelsPage() {
  const [labels, setLabels] = useState<Label[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const navigate = useNavigate()

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState(DEFAULT_COLORS[0])
  const [category, setCategory] = useState('')

  const loadLabels = useCallback(async () => {
    try {
      const data = await api<Label[]>('/labels')
      setLabels(data)
    } catch {
      setMessage('Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadLabels() }, [loadLabels])

  const resetForm = () => { setShowForm(false); setEditId(null); setName(''); setColor(DEFAULT_COLORS[0]); setCategory('') }

  const startEdit = (label: Label) => {
    setEditId(label.id); setName(label.name); setColor(label.color); setCategory(label.category || ''); setShowForm(true)
  }

  const saveLabel = async () => {
    if (!name.trim()) { setMessage('Name ist erforderlich'); return }
    try {
      if (editId) {
        await api(`/labels/${editId}`, { method: 'PUT', body: { name: name.trim(), color, category: category.trim() || null } })
      } else {
        await api('/labels', { method: 'POST', body: { name: name.trim(), color, category: category.trim() || null } })
      }
      resetForm(); loadLabels()
    } catch { setMessage('Fehler beim Speichern') }
  }

  const deleteLabel = async (label: Label) => {
    if (!confirm(`"${label.name}" loeschen?`)) return
    try { await api(`/labels/${label.id}`, { method: 'DELETE' }); loadLabels() }
    catch { setMessage('Fehler beim Loeschen') }
  }

  const categories = [...new Set(labels.map((l) => l.category || 'Ohne Kategorie'))]

  return (
    <div>
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate('/settings')}>
          <ChevronLeft size={22} />
        </button>
        <div className="topbar-title">Labels verwalten</div>
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
              <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Label-Name" />
            </div>
            <div className="auth-field">
              <label className="auth-label">Kategorie</label>
              <input className="auth-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="z.B. Stimme, Status" />
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
              <button className="auth-submit" style={{ flex: 1 }} onClick={saveLabel}>
                {editId ? 'Aktualisieren' : 'Erstellen'}
              </button>
              <button className="btn btn-secondary" onClick={resetForm}>Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="empty-state">Laden...</div>}

      {categories.map((cat) => (
        <div key={cat}>
          <div style={{
            padding: '8px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 0.5, background: 'var(--bg-secondary)',
          }}>{cat}</div>
          <ul className="file-list">
            {labels.filter((l) => (l.category || 'Ohne Kategorie') === cat).map((label) => (
              <li key={label.id} className="file-item" style={{ cursor: 'default' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: label.color, flexShrink: 0 }} />
                <div className="file-info">
                  <div className="file-name">{label.name}</div>
                </div>
                <button className="player-header-btn" onClick={() => startEdit(label)}>
                  <Pencil size={15} />
                </button>
                <button className="player-header-btn" onClick={() => deleteLabel(label)} style={{ color: 'var(--danger)' }}>
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
