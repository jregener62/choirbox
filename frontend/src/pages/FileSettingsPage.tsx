import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, FileAudio, Info } from 'lucide-react'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import { formatDisplayName } from '@/utils/formatters.ts'
import type { DropboxEntry, Section } from '@/types/index.ts'

interface FileSettingsData {
  dropbox_path: string
  section_ref_path: string | null
}

export function FileSettingsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const currentPath = usePlayerStore((s) => s.currentPath)
  const user = useAuthStore((s) => s.user)
  const canEdit = hasMinRole(user?.role ?? 'guest', 'pro-member')

  const filePath = searchParams.get('path') || currentPath
  if (!filePath) {
    navigate('/', { replace: true })
    return null
  }

  const fileName = filePath.split('/').pop() || filePath
  const parentFolder = filePath.substring(0, filePath.lastIndexOf('/')) || '/'

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 4, display: 'flex' }}
        >
          <ChevronLeft size={24} />
        </button>
        <h2 style={{ fontSize: 17, fontWeight: 600, margin: 0 }}>Datei-Einstellungen</h2>
      </div>

      <div style={{ padding: '0 16px 24px' }}>
        {/* File info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
          <FileAudio size={24} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {formatDisplayName(fileName)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {parentFolder}
            </div>
          </div>
        </div>

        {/* Section reference */}
        <SectionRefEditor
          filePath={filePath}
          parentFolder={parentFolder}
          canEdit={canEdit}
        />
      </div>
    </div>
  )
}


function SectionRefEditor({ filePath, parentFolder, canEdit }: {
  filePath: string
  parentFolder: string
  canEdit: boolean
}) {
  const [settings, setSettings] = useState<FileSettingsData | null>(null)
  const [mode, setMode] = useState<'own' | 'ref'>('own')
  const [refPath, setRefPath] = useState<string>('')
  const [siblingFiles, setSiblingFiles] = useState<DropboxEntry[]>([])
  const [refSectionCount, setRefSectionCount] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load current settings
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await api<FileSettingsData>(`/file-settings?path=${encodeURIComponent(filePath)}`)
        setSettings(data)
        if (data.section_ref_path) {
          setMode('ref')
          setRefPath(data.section_ref_path)
        } else {
          setMode('own')
          setRefPath('')
        }
      } catch {
        // No settings yet
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filePath])

  // Load sibling files when switching to ref mode
  useEffect(() => {
    if (mode !== 'ref' || siblingFiles.length > 0) return
    async function loadSiblings() {
      try {
        const data = await api<{ entries: DropboxEntry[] }>(`/dropbox/browse?path=${encodeURIComponent(parentFolder)}`)
        const files = data.entries.filter(
          (e) => e.type === 'file' && e.path !== filePath
        )
        setSiblingFiles(files)
      } catch {
        // ignore
      }
    }
    loadSiblings()
  }, [mode, parentFolder, filePath, siblingFiles.length])

  // Load section count for selected reference
  useEffect(() => {
    if (!refPath) {
      setRefSectionCount(null)
      return
    }
    async function loadCount() {
      try {
        const sections = await api<Section[]>(`/sections?path=${encodeURIComponent(refPath)}`)
        setRefSectionCount(sections.length)
      } catch {
        setRefSectionCount(null)
      }
    }
    loadCount()
  }, [refPath])

  const hasChanges = (() => {
    const currentRef = settings?.section_ref_path || null
    if (mode === 'own') return currentRef !== null
    return refPath !== (currentRef || '')
  })()

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      await api('/file-settings', {
        method: 'PUT',
        body: {
          dropbox_path: filePath,
          section_ref_path: mode === 'ref' ? refPath : null,
        },
      })
      setSettings({
        dropbox_path: filePath,
        section_ref_path: mode === 'ref' ? refPath : null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '24px 0', color: 'var(--text-muted)', fontSize: 14 }}>Laden...</div>
  }

  return (
    <div style={{ paddingTop: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
        Sektionsquelle
      </div>

      {/* Info text */}
      <div style={{
        fontSize: 12,
        color: 'var(--text-muted)',
        marginBottom: 16,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        background: 'var(--bg-secondary)',
        padding: '10px 12px',
        borderRadius: 8,
      }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>Sektionen koennen von einer anderen Datei uebernommen werden — z.B. wenn mehrere Stimmlagen als separate Dateien vorliegen.</span>
      </div>

      {/* Radio: own sections */}
      <label style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '12px 0',
        cursor: canEdit ? 'pointer' : 'default',
        fontSize: 14,
      }}>
        <input
          type="radio"
          name="section-mode"
          checked={mode === 'own'}
          onChange={() => { setMode('own'); setRefPath('') }}
          disabled={!canEdit}
          style={{ accentColor: 'var(--accent)', width: 18, height: 18 }}
        />
        <span>Eigene Sektionen</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(Standard)</span>
      </label>

      {/* Radio: ref sections */}
      <label style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '12px 0',
        cursor: canEdit ? 'pointer' : 'default',
        fontSize: 14,
      }}>
        <input
          type="radio"
          name="section-mode"
          checked={mode === 'ref'}
          onChange={() => setMode('ref')}
          disabled={!canEdit}
          style={{ accentColor: 'var(--accent)', width: 18, height: 18, marginTop: 2 }}
        />
        <div style={{ flex: 1 }}>
          <div>Sektionen uebernehmen von:</div>

          {mode === 'ref' && (
            <div style={{ marginTop: 8 }}>
              <select
                value={refPath}
                onChange={(e) => setRefPath(e.target.value)}
                disabled={!canEdit}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  appearance: 'auto',
                }}
              >
                <option value="">— Datei waehlen —</option>
                {siblingFiles.map((f) => (
                  <option key={f.path} value={f.path}>
                    {formatDisplayName(f.name)}
                  </option>
                ))}
              </select>

              {refPath && refSectionCount !== null && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  {refSectionCount === 0
                    ? 'Keine Sektionen vorhanden'
                    : `${refSectionCount} ${refSectionCount === 1 ? 'Sektion' : 'Sektionen'} vorhanden`}
                </div>
              )}
            </div>
          )}
        </div>
      </label>

      {/* Save button */}
      {canEdit && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={save}
            disabled={saving || !hasChanges || (mode === 'ref' && !refPath)}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: 15,
              fontWeight: 600,
              fontFamily: 'inherit',
              borderRadius: 10,
              border: 'none',
              background: hasChanges ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: hasChanges ? 'white' : 'var(--text-muted)',
              cursor: hasChanges ? 'pointer' : 'default',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Speichern...' : saved ? 'Gespeichert ✓' : 'Speichern'}
          </button>
        </div>
      )}

      {!canEdit && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
          Nur Pro-Mitglieder und hoeher koennen Einstellungen aendern.
        </div>
      )}
    </div>
  )
}
