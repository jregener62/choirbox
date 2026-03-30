import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, FileAudio, Info, Send } from 'lucide-react'
import { api } from '@/api/client.ts'
import { usePlayerStore } from '@/stores/playerStore.ts'
import { useSectionsStore } from '@/hooks/useSections.ts'
import { usePdfStore } from '@/hooks/usePdf.ts'
import { useAuthStore } from '@/stores/authStore.ts'
import { hasMinRole } from '@/utils/roles.ts'
import type { DropboxEntry, Section } from '@/types/index.ts'
import type { PdfInfo } from '@/types/index.ts'

interface FileSettingsData {
  dropbox_path: string
  section_ref_path: string | null
  pdf_ref_path: string | null
}

export function FileSettingsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const currentPath = usePlayerStore((s) => s.currentPath)
  const user = useAuthStore((s) => s.user)
  const canEdit = hasMinRole(user?.role ?? 'guest', 'pro-member')

  const filePath = searchParams.get('path') || currentPath || ''
  if (!filePath) {
    navigate('/', { replace: true })
    return null
  }

  const fileName = filePath.split('/').pop() || filePath
  const parentFolder = filePath.substring(0, filePath.lastIndexOf('/')) || '/'

  // Shared state
  const [settings, setSettings] = useState<FileSettingsData | null>(null)
  const [siblingFiles, setSiblingFiles] = useState<DropboxEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Load settings + siblings
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [data, browse] = await Promise.all([
          api<FileSettingsData>(`/file-settings?path=${encodeURIComponent(filePath)}`),
          api<{ entries: DropboxEntry[] }>(`/dropbox/browse?path=${encodeURIComponent(parentFolder)}`),
        ])
        setSettings(data)
        setSiblingFiles(browse.entries.filter((e) => e.type === 'file' && e.path !== filePath && /\.(mp3|m4a|webm)$/i.test(e.name)))
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [filePath, parentFolder])

  const updateSettings = (patch: Partial<FileSettingsData>) => {
    setSettings((prev) => prev ? { ...prev, ...patch } : prev)
  }

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
              {fileName.replace(/\.(mp3|m4a|webm)$/i, '')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {parentFolder}
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '24px 0', color: 'var(--text-muted)', fontSize: 14 }}>Laden...</div>
        ) : (
          <>
            <RefEditor
              filePath={filePath}
              field="section_ref_path"
              title="Sektionsquelle"
              infoText="Sektionen koennen von einer anderen Datei uebernommen werden — z.B. wenn mehrere Stimmlagen als separate Dateien vorliegen."
              propagateLabel="Sektionen uebertragen auf:"
              propagateHint="Setzt diese Datei als Sektionsquelle fuer die gewaehlten Dateien."
              currentRef={settings?.section_ref_path ?? null}
              siblingFiles={siblingFiles}
              canEdit={canEdit}
              onSaved={(ref) => {
                updateSettings({ section_ref_path: ref })
                useSectionsStore.getState().clear()
              }}
              loadRefInfo={async (refPath) => {
                const sections = await api<Section[]>(`/sections?path=${encodeURIComponent(refPath)}`)
                return sections.length === 0
                  ? 'Keine Sektionen vorhanden'
                  : `${sections.length} ${sections.length === 1 ? 'Sektion' : 'Sektionen'} vorhanden`
              }}
            />

            <div style={{ borderTop: '1px solid var(--border)', marginTop: 20 }} />

            <RefEditor
              filePath={filePath}
              field="pdf_ref_path"
              title="PDF-Quelle"
              infoText="Das PDF-Dokument kann von einer anderen Datei uebernommen werden — z.B. wenn alle Stimmlagen dieselben Noten verwenden."
              propagateLabel="PDF uebertragen auf:"
              propagateHint="Setzt diese Datei als PDF-Quelle fuer die gewaehlten Dateien."
              currentRef={settings?.pdf_ref_path ?? null}
              siblingFiles={siblingFiles}
              canEdit={canEdit}
              onSaved={(ref) => {
                updateSettings({ pdf_ref_path: ref })
                usePdfStore.getState().clear()
              }}
              loadRefInfo={async (refPath) => {
                const info = await api<PdfInfo>(`/pdf/info?path=${encodeURIComponent(refPath)}`)
                return info.has_pdf
                  ? `PDF vorhanden: ${info.original_name}`
                  : 'Kein PDF vorhanden'
              }}
            />

            {!canEdit && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>
                Nur Pro-Mitglieder und hoeher koennen Einstellungen aendern.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}


interface RefEditorProps {
  filePath: string
  field: 'section_ref_path' | 'pdf_ref_path'
  title: string
  infoText: string
  propagateLabel: string
  propagateHint: string
  currentRef: string | null
  siblingFiles: DropboxEntry[]
  canEdit: boolean
  onSaved: (ref: string | null) => void
  loadRefInfo: (refPath: string) => Promise<string>
}

function RefEditor({
  filePath, field, title, infoText, propagateLabel, propagateHint,
  currentRef, siblingFiles, canEdit, onSaved, loadRefInfo,
}: RefEditorProps) {
  const [mode, setMode] = useState<'own' | 'ref'>(currentRef ? 'ref' : 'own')
  const [refPath, setRefPath] = useState(currentRef || '')
  const [refInfo, setRefInfo] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Propagation
  const [propagateTargets, setPropagateTargets] = useState<Set<string>>(new Set())
  const [propagating, setPropagating] = useState(false)
  const [propagated, setPropagated] = useState(false)

  // Sync when currentRef changes (e.g. after page-level reload)
  useEffect(() => {
    setMode(currentRef ? 'ref' : 'own')
    setRefPath(currentRef || '')
  }, [currentRef])

  // Load ref info when selection changes
  useEffect(() => {
    if (!refPath) {
      setRefInfo(null)
      return
    }
    let cancelled = false
    loadRefInfo(refPath).then((info) => {
      if (!cancelled) setRefInfo(info)
    }).catch(() => {
      if (!cancelled) setRefInfo(null)
    })
    return () => { cancelled = true }
  }, [refPath, loadRefInfo])

  const hasChanges = (() => {
    if (mode === 'own') return currentRef !== null
    return refPath !== (currentRef || '')
  })()

  async function save() {
    setSaving(true)
    setSaved(false)
    try {
      const newRef = mode === 'ref' ? refPath : null
      await api('/file-settings', {
        method: 'PUT',
        body: {
          dropbox_path: filePath,
          [field]: newRef,
        },
      })
      onSaved(newRef)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  async function propagate() {
    setPropagating(true)
    setPropagated(false)
    try {
      await api('/file-settings/propagate', {
        method: 'POST',
        body: {
          reference_path: filePath,
          target_paths: Array.from(propagateTargets),
          field,
        },
      })
      setPropagated(true)
      setPropagateTargets(new Set())
      setTimeout(() => setPropagated(false), 2000)
    } catch {
      // ignore
    } finally {
      setPropagating(false)
    }
  }

  return (
    <div style={{ paddingTop: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-primary)' }}>
        {title}
      </div>

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
        <span>{infoText}</span>
      </div>

      {/* Radio options */}
      <div style={{ display: 'flex', gap: 16, padding: '12px 0' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canEdit ? 'pointer' : 'default', fontSize: 14 }}>
          <input
            type="radio"
            name={`${field}-mode`}
            checked={mode === 'own'}
            onChange={() => { setMode('own'); setRefPath('') }}
            disabled={!canEdit}
            style={{ accentColor: 'var(--accent)', width: 18, height: 18 }}
          />
          <span>Eigene</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(Standard)</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canEdit ? 'pointer' : 'default', fontSize: 14 }}>
          <input
            type="radio"
            name={`${field}-mode`}
            checked={mode === 'ref'}
            onChange={() => setMode('ref')}
            disabled={!canEdit}
            style={{ accentColor: 'var(--accent)', width: 18, height: 18 }}
          />
          <span>Uebernehmen von:</span>
        </label>
      </div>

      {mode === 'ref' && (
        <div>
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
                {f.name.replace(/\.(mp3|m4a|webm)$/i, '')}
              </option>
            ))}
          </select>

          {refPath && refInfo && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              {refInfo}
            </div>
          )}
        </div>
      )}

      {/* Propagate */}
      {mode === 'own' && canEdit && siblingFiles.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Send size={14} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {propagateLabel}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
            {propagateHint}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {siblingFiles.map((f) => {
              const checked = propagateTargets.has(f.path)
              return (
                <label key={f.path} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'pointer', fontSize: 14,
                }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const next = new Set(propagateTargets)
                      if (checked) next.delete(f.path)
                      else next.add(f.path)
                      setPropagateTargets(next)
                    }}
                    style={{ accentColor: 'var(--accent)', width: 18, height: 18 }}
                  />
                  <span>{f.name.replace(/\.(mp3|m4a|webm)$/i, '')}</span>
                </label>
              )
            })}
          </div>

          {propagateTargets.size > 0 && (
            <button
              onClick={propagate}
              disabled={propagating}
              style={{
                marginTop: 12, width: '100%', padding: '12px', fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
                borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer',
                opacity: propagating ? 0.6 : 1,
              }}
            >
              {propagating ? 'Uebertragen...' : propagated ? 'Uebertragen ✓' : `Auf ${propagateTargets.size} ${propagateTargets.size === 1 ? 'Datei' : 'Dateien'} uebertragen`}
            </button>
          )}
        </div>
      )}

      {/* Save */}
      {canEdit && hasChanges && (
        <div style={{ marginTop: 24 }}>
          <button
            onClick={save}
            disabled={saving || (mode === 'ref' && !refPath)}
            style={{
              width: '100%', padding: '12px', fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
              borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'white', cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Speichern...' : saved ? 'Gespeichert ✓' : 'Speichern'}
          </button>
        </div>
      )}
    </div>
  )
}
