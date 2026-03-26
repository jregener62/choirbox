import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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

  // New label form
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
      setMessage('Fehler beim Laden der Labels')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLabels()
  }, [loadLabels])

  const resetForm = () => {
    setShowForm(false)
    setEditId(null)
    setName('')
    setColor(DEFAULT_COLORS[0])
    setCategory('')
  }

  const startEdit = (label: Label) => {
    setEditId(label.id)
    setName(label.name)
    setColor(label.color)
    setCategory(label.category || '')
    setShowForm(true)
  }

  const saveLabel = async () => {
    if (!name.trim()) {
      setMessage('Name ist erforderlich')
      return
    }

    try {
      if (editId) {
        await api(`/labels/${editId}`, {
          method: 'PUT',
          body: { name: name.trim(), color, category: category.trim() || null },
        })
        setMessage('Label aktualisiert')
      } else {
        await api('/labels', {
          method: 'POST',
          body: { name: name.trim(), color, category: category.trim() || null },
        })
        setMessage('Label erstellt')
      }
      resetForm()
      loadLabels()
    } catch {
      setMessage('Fehler beim Speichern')
    }
  }

  const deleteLabel = async (label: Label) => {
    if (!confirm(`Label "${label.name}" loeschen?`)) return
    try {
      await api(`/labels/${label.id}`, { method: 'DELETE' })
      setMessage(`"${label.name}" geloescht`)
      loadLabels()
    } catch {
      setMessage('Fehler beim Loeschen')
    }
  }

  // Group labels by category
  const categories = [...new Set(labels.map((l) => l.category || 'Ohne Kategorie'))]

  return (
    <div>
      <div className="topbar">
        <button className="btn-icon" onClick={() => navigate('/settings')}>{'\u2190'}</button>
        <div className="topbar-title">Labels verwalten</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{labels.length}</div>
      </div>

      {message && (
        <div
          style={{ padding: '10px 16px', background: 'var(--bg-tertiary)', fontSize: 14 }}
          onClick={() => setMessage('')}
        >
          {message}
        </div>
      )}

      {/* Add/Edit form */}
      {showForm ? (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              className="input"
              placeholder="Label-Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              className="input"
              placeholder="Kategorie (z.B. Stimme, Status)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <div>
              <div className="input-label" style={{ marginBottom: 6 }}>Farbe</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DEFAULT_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      border: c === color ? '3px solid var(--text-primary)' : '2px solid transparent',
                      background: c,
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveLabel}>
                {editId ? 'Aktualisieren' : 'Erstellen'}
              </button>
              <button className="btn btn-secondary" onClick={resetForm}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '12px 16px' }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => setShowForm(true)}
          >
            + Neues Label
          </button>
        </div>
      )}

      {loading && <div className="empty-state">Laden...</div>}

      {!loading && labels.length === 0 && (
        <div className="empty-state">Keine Labels vorhanden</div>
      )}

      {categories.map((cat) => (
        <div key={cat}>
          <div style={{
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            background: 'var(--bg-secondary)',
          }}>
            {cat}
          </div>
          <ul className="file-list">
            {labels
              .filter((l) => (l.category || 'Ohne Kategorie') === cat)
              .map((label) => (
                <li key={label.id} className="user-item">
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: label.color,
                      flexShrink: 0,
                    }}
                  />
                  <div className="user-info">
                    <div className="user-name">{label.name}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn-icon"
                      title="Bearbeiten"
                      onClick={() => startEdit(label)}
                      style={{ fontSize: 16 }}
                    >
                      {'\u270F\uFE0F'}
                    </button>
                    <button
                      className="btn-icon"
                      title="Loeschen"
                      onClick={() => deleteLabel(label)}
                      style={{ fontSize: 16, color: 'var(--danger)' }}
                    >
                      {'\uD83D\uDDD1'}
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
