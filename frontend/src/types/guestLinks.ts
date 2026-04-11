/** Types fuer die Guest-Link-API. */

export type GuestLinkStatus = 'active' | 'consumed' | 'revoked' | 'expired'

export interface GuestLinkItem {
  id: number
  label: string | null
  created_at: string
  expires_at: string
  consumed_at: string | null
  consumed_by_ip: string | null
  revoked_at: string | null
  status: GuestLinkStatus
}

/** Response von POST /api/guest-links — enthaelt einmalig den Klartext. */
export interface GuestLinkCreateResponse extends GuestLinkItem {
  token: string
  redeem_path: string
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
