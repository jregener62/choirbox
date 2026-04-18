import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import { api } from '@/api/client.ts'
import { hasMinRole } from '@/utils/roles.ts'

interface DropboxStatus {
  connected: boolean
  configured: boolean
  account_email: string | null
  account_id: string | null
}

interface BackupStatus {
  last_backup_at: string | null
  last_backup_size: number | null
  last_backup_error: string | null
}

type ResyncResponse = {
  dry_run?: boolean
  synced_folders: number
  added: number
  updated: number
  removed: number
  meta_synced?: number
  backup_file?: string
}

export function DataSettingsPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const location = useLocation()
  const isAdmin = hasMinRole(user?.role ?? 'guest', 'admin')
  const isDeveloper = hasMinRole(user?.role ?? 'guest', 'developer')

  const [dbxStatus, setDbxStatus] = useState<DropboxStatus | null>(null)
  const [dbxLoading, setDbxLoading] = useState(false)
  const [backupStatus, setBackupStatus] = useState<BackupStatus | null>(null)
  const [message, setMessage] = useState('')
  const [resyncing, setResyncing] = useState(false)
  const [resyncResult, setResyncResult] = useState('')

  const loadDropboxStatus = useCallback(async () => {
    setDbxLoading(true)
    try {
      const status = await api<DropboxStatus>('/dropbox/status')
      setDbxStatus(status)
    } catch {
      // not connected or not configured
    } finally {
      setDbxLoading(false)
    }
  }, [])

  const loadBackupStatus = useCallback(async () => {
    if (!isDeveloper) return
    try {
      const status = await api<BackupStatus>('/admin/backup-status')
      setBackupStatus(status)
    } catch {
      // ignore
    }
  }, [isDeveloper])

  useEffect(() => {
    if (!isAdmin) {
      navigate('/settings', { replace: true })
      return
    }
    loadDropboxStatus()
    loadBackupStatus()
  }, [isAdmin, loadDropboxStatus, loadBackupStatus, navigate])

  useEffect(() => {
    if (location.search?.includes('dropbox=connected')) {
      setMessage('Dropbox verbunden!')
      navigate('/settings/data', { replace: true })
    }
  }, [location.search, navigate])

  const connectDropbox = useCallback(async () => {
    try {
      const data = await api<{ authorize_url: string }>('/dropbox/authorize')
      window.location.href = data.authorize_url
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'OAuth-Start fehlgeschlagen')
    }
  }, [])

  const disconnectDropbox = useCallback(async () => {
    if (!confirm('Dropbox wirklich trennen?')) return
    try {
      await api('/dropbox/disconnect', { method: 'POST' })
      setMessage('Dropbox getrennt')
      setDbxStatus(null)
      loadDropboxStatus()
    } catch {
      setMessage('Fehler beim Trennen')
    }
  }, [loadDropboxStatus])

  const runResync = useCallback(async (dryRun: boolean) => {
    setResyncing(true)
    setResyncResult('')
    try {
      const url = dryRun ? '/admin/resync?dry_run=true' : '/admin/resync'
      const data = await api<ResyncResponse>(url, { method: 'POST' })
      const parts: string[] = []
      if (data.added) parts.push(`${data.added} neu`)
      if (data.updated) parts.push(`${data.updated} aktualisiert`)
      if (data.removed) parts.push(`${data.removed} entfernt`)
      const prefix = dryRun ? 'Simulation: ' : ''
      setResyncResult(
        `${prefix}${data.synced_folders} Ordner geprueft` +
        (parts.length ? ` (${parts.join(', ')})` : ' — alles aktuell')
      )
    } catch (err) {
      setResyncResult(err instanceof Error ? err.message : 'Fehler bei der Synchronisation')
    } finally {
      setResyncing(false)
    }
  }, [])

  if (!isAdmin) return null

  return (
    <div>
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate('/settings')}>
          <ChevronLeft size={22} />
        </button>
        <div className="topbar-title">Daten &amp; Sync</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>

        {message && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'var(--bg-tertiary)',
              fontSize: 14,
            }}
            onClick={() => setMessage('')}
          >
            {message}
          </div>
        )}

        {/* -- Dropbox (Developer) -- */}
        {isDeveloper && (
          <section>
            <h3 className="settings-heading">
              {dbxStatus?.connected ? <Cloud size={14} /> : <CloudOff size={14} />} Dropbox
            </h3>
            {dbxLoading ? (
              <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Lade Status...</div>
            ) : dbxStatus?.connected ? (
              <div className="settings-rows">
                <div className="settings-row">
                  <span className="settings-label">Status</span>
                  <span style={{ color: 'var(--success)' }}>Verbunden</span>
                </div>
                <div className="settings-row">
                  <span className="settings-label">Account</span>
                  <span style={{ fontSize: 13 }}>{dbxStatus.account_email}</span>
                </div>
                <button
                  className="btn btn-secondary"
                  style={{ width: '100%', marginTop: 8, color: 'var(--danger)' }}
                  onClick={disconnectDropbox}
                >
                  Dropbox trennen
                </button>
              </div>
            ) : dbxStatus?.configured ? (
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Verbinde den Dropbox-Account, damit Chormitglieder auf die Dateien zugreifen koennen.
                </div>
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={connectDropbox}>
                  Mit Dropbox verbinden
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--danger)' }}>
                DROPBOX_APP_KEY und DROPBOX_APP_SECRET in .env eintragen.
              </div>
            )}
            {backupStatus && (
              <div className="settings-rows" style={{ marginTop: 16 }}>
                <div className="settings-row">
                  <span className="settings-label">Letztes Backup</span>
                  <span style={{ fontSize: 13 }}>
                    {backupStatus.last_backup_at
                      ? new Date(backupStatus.last_backup_at + 'Z').toLocaleString('de-DE')
                      : 'noch nie'}
                  </span>
                </div>
                {backupStatus.last_backup_size !== null && (
                  <div className="settings-row">
                    <span className="settings-label">Groesse</span>
                    <span style={{ fontSize: 13 }}>
                      {(backupStatus.last_backup_size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                )}
                {backupStatus.last_backup_error && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: 12,
                      background: 'var(--danger-bg, rgba(239, 68, 68, 0.1))',
                      color: 'var(--danger)',
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    <strong>Backup fehlgeschlagen:</strong>{' '}
                    <span style={{ wordBreak: 'break-word' }}>{backupStatus.last_backup_error}</span>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* -- Wartung / Re-Sync (Admin, nur wenn Dropbox verbunden) -- */}
        {dbxStatus?.connected && (
          <section>
            <h3 className="settings-heading"><RefreshCw size={14} /> Wartung</h3>
            <div className="settings-group">
              <button
                className="settings-nav-item"
                disabled={resyncing}
                onClick={() => runResync(true)}
              >
                <RefreshCw size={18} className={resyncing ? 'spinning' : ''} />
                <span>{resyncing ? 'Pruefe...' : 'Resync simulieren (Dry-Run)'}</span>
              </button>
              <button
                className="settings-nav-item"
                disabled={resyncing}
                onClick={() => runResync(false)}
              >
                <RefreshCw size={18} className={resyncing ? 'spinning' : ''} />
                <span>{resyncing ? 'Synchronisiere...' : 'Dropbox Re-Sync'}</span>
              </button>
              {resyncResult && (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', padding: '0 var(--space-4)' }}>
                  {resyncResult}
                </p>
              )}
            </div>
          </section>
        )}

        {/* -- Hinweis wenn Admin, aber kein Dropbox (nur non-developer admins sehen das) -- */}
        {!isDeveloper && !dbxStatus?.connected && (
          <section>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Dropbox ist nicht verbunden. Bitte an den technischen Administrator wenden.
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
