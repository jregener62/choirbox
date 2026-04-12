/** Types fuer die Guest-Link-API. */

export type GuestLinkStatus = 'active' | 'revoked' | 'expired' | 'exhausted'

export interface GuestLinkItem {
  id: number
  label: string | null
  created_at: string
  expires_at: string
  /** Maximale Einloesungen. `null` = unbegrenzt (Multi-Use). */
  max_uses: number | null
  /** Bisherige Einloesungen. */
  uses_count: number
  /** Zeitstempel der ersten Einloesung (oder null wenn noch nie benutzt). */
  first_used_at: string | null
  /** Zeitstempel der letzten Einloesung. */
  last_used_at: string | null
  /** IP der letzten Einloesung. */
  last_used_ip: string | null
  /** Ansichtsmodus: "songs" (alles) oder "texts" (nur Texte). */
  view_mode: 'songs' | 'texts'
  revoked_at: string | null
  status: GuestLinkStatus
}

/** Response von POST /api/guest-links — enthaelt einmalig den Klartext. */
export interface GuestLinkCreateResponse extends GuestLinkItem {
  token: string
  redeem_path: string
}

/** Request-Body fuer POST /api/guest-links. */
export interface GuestLinkCreateRequest {
  label?: string | null
  ttl_minutes?: number
  /** `null` oder weglassen -> unbegrenzt. Zahl >= 1 -> Limit. */
  max_uses?: number | null
}

/** Response von POST /api/guest-links/redeem. */
export interface GuestRedeemResponse {
  token: string
  user: {
    id: string
    username: string
    display_name: string
    role: string
    voice_part: string
    choir_id: string | null
    choir_name: string | null
    must_change_password: boolean
    can_report_bugs: boolean
  }
  expires_in: number
}

/** Response von GET /api/guest-links/ttl-config. */
export interface GuestLinkTtlConfig {
  min_minutes: number
  max_minutes: number
  guest_session_ttl_seconds: number
}
