import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Copy, Trash2, Plus, Check } from 'lucide-react'

import { api } from '@/api/client.ts'
import type {
  GuestLinkCreateResponse,
  GuestLinkItem,
  GuestLinkStatus,
  GuestLinkTtlConfig,
} from '@/types/guestLinks.ts'

/**
 * Admin-Seite zum Verwalten von Gast-Zugangs-Codes.
 *
 * - Listet alle vorhandenen Codes des eigenen Chors
 * - Erzeugt neue Codes mit Label + TTL
 * - Widerruft aktive Codes
 * - Zeigt den Klartext-Code nur einmal direkt nach Erstellung an (wie
 *   das Backend ihn liefert) — danach nie wieder.
 */
export function GuestLinksPage() {
  const navigate = useNavigate()

  const [links, setLinks] = useState<GuestLinkItem[]>([])
  const [ttlConfig, setTtlConfig] = useState<GuestLinkTtlConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  // Create form
  const [label, setLabel] = useState('')
  const [ttlMinutes, setTtlMinutes] = useState<number>(60)
  const [creating, setCreating] = useState(false)

  // Last-created-link banner (zeigt den Klartext-Token genau einmal)
  const [freshLink, setFreshLink] = useState<GuestLinkCreateResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const loadLinks = useCallback(async () => {
    try {
      const data = await api<GuestLinkItem[]>('/guest-links')
      setLinks(data)
    } catch {
      setMessage('Fehler beim Laden der Gast-Links')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLinks()
    // TTL-config ist public — kein Auth noetig
    fetch('/api/guest-links/ttl-config')
      .then((r) => r.json())
      .then((c: GuestLinkTtlConfig) => {
        setTtlConfig(c)
      })
      .catch(() => {})
  }, [loadLinks])

  const absoluteRedeemUrl = (redeemPath: string) => {
    // redeemPath ist "/guest/<token>". Wir wollen einen kompletten URL,
    // der im HashRouter funktioniert: https://host/#/guest/<token>
    const origin = window.location.origin
    return `${origin}/#${redeemPath}`
  }

  const createLink = async () => {
    setCreating(true)
    setMessage('')
    try {
      const data = await api<GuestLinkCreateResponse>('/guest-links', {
        method: 'POST',
        body: {
          label: label.trim() || null,
          ttl_minutes: ttlMinutes,
        },
      })
      setFreshLink(data)
      setLabel('')
      setCopied(false)
      await loadLinks()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    } finally {
      setCreating(false)
    }
  }

  const revokeLink = async (link: GuestLinkItem) => {
    if (!confirm('Diesen Gast-Link widerrufen? Er ist danach nicht mehr einloesbar.')) {
      return
    }
    try {
      await api(`/guest-links/${link.id}`, { method: 'DELETE' })
      setMessage('Link widerrufen')
      await loadLinks()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Fehler beim Widerrufen')
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setMessage('Kopieren fehlgeschlagen')
    }
  }

  const formatDateTime = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const statusLabel = (s: GuestLinkStatus) => {
    switch (s) {
      case 'active':
        return 'aktiv'
      case 'consumed':
        return 'eingeloest'
      case 'revoked':
        return 'widerrufen'
      case 'expired':
        return 'abgelaufen'
    }
  }

  const statusColor = (s: GuestLinkStatus) => {
    switch (s) {
      case 'active':
        return '#10b981'
      case 'consumed':
        return 'var(--text-muted)'
      case 'revoked':
      case 'expired':
        return 'var(--danger)'
    }
  }

  return (
    <div>
      <div className="topbar">
        <button className="topbar-back" onClick={() => navigate('/settings')}>
          <ChevronLeft size={22} />
        </button>
        <div className="topbar-title">Gast-Zugaenge</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '0 8px' }}>
          {links.length}
        </div>
      </div>

      {message && (
        <div
          style={{ padding: '10px 16px', background: 'var(--bg-tertiary)', fontSize: 13 }}
          onClick={() => setMessage('')}
        >
          {message}
        </div>
      )}

      {/* Banner mit frisch erzeugtem Klartext-Link */}
      {freshLink && (
        <div
          style={{
            margin: '12px 16px',
            padding: 12,
            borderRadius: 8,
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--accent)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            Neuer Gast-Link — nur jetzt sichtbar, danach nie wieder:
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 12,
              wordBreak: 'break-all',
              padding: '8px 10px',
              background: 'var(--bg-primary)',
              borderRadius: 6,
              marginBottom: 8,
            }}
          >
            {absoluteRedeemUrl(freshLink.redeem_path)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => copyToClipboard(absoluteRedeemUrl(freshLink.redeem_path))}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span style={{ marginLeft: 6 }}>{copied ? 'Kopiert' : 'Kopieren'}</span>
            </button>
            <button className="btn btn-secondary" onClick={() => setFreshLink(null)}>
              Schliessen
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
            Gueltig bis {formatDateTime(freshLink.expires_at)} · Einmal einloesbar
          </div>
        </div>
      )}

      {/* Create-Form */}
      <div
        style={{
          margin: '12px 16px',
          padding: 12,
          borderRadius: 8,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Neuen Link erzeugen</div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>Beschreibung (optional)</label>
          <input
            type="text"
            className="auth-input"
            placeholder="z.B. Probenbesuch Oktober"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={200}
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Gueltig fuer (Minuten)
            {ttlConfig && ` — erlaubt: ${ttlConfig.min_minutes}–${ttlConfig.max_minutes}`}
          </label>
          <input
            type="number"
            className="auth-input"
            value={ttlMinutes}
            min={ttlConfig?.min_minutes ?? 15}
            max={ttlConfig?.max_minutes ?? 1440}
            onChange={(e) => setTtlMinutes(parseInt(e.target.value, 10) || 60)}
          />
        </div>
        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={createLink}
          disabled={creating}
        >
          <Plus size={14} />
          <span style={{ marginLeft: 6 }}>{creating ? 'Erzeuge…' : 'Link erzeugen'}</span>
        </button>
      </div>

      {loading && <div className="empty-state">Laden...</div>}

      {/* Liste */}
      <ul className="file-list">
        {links.map((l) => (
          <li key={l.id} className="file-item" style={{ cursor: 'default' }}>
            <div className="file-info">
              <div className="file-name">{l.label || '(ohne Label)'}</div>
              <div className="file-meta">
                <span style={{ color: statusColor(l.status) }}>{statusLabel(l.status)}</span>
                {' · '}
                erstellt {formatDateTime(l.created_at)}
                {l.status === 'active' && ` · gueltig bis ${formatDateTime(l.expires_at)}`}
                {l.consumed_at && ` · eingeloest ${formatDateTime(l.consumed_at)}`}
                {l.consumed_by_ip && ` (${l.consumed_by_ip})`}
              </div>
            </div>
            {l.status === 'active' && (
              <button
                className="player-header-btn"
                title="Widerrufen"
                onClick={() => revokeLink(l)}
                style={{ color: 'var(--danger)' }}
              >
                <Trash2 size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {!loading && links.length === 0 && (
        <div className="empty-state">Noch keine Gast-Links vorhanden.</div>
      )}
    </div>
  )
}
