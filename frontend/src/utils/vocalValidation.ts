/**
 * Vocal-instruction token vocabulary.
 *
 * Tokens use ChordPro brace syntax `{v:token}`. Current scope:
 * - beat: `{v:1}` (Taktanfang / Zaehlzeit 1)
 * - note: `{v:n:<text>}` (Freitext-Kommentar)
 */

export const BEAT_RE = /^1$/
export const NOTE_RE = /^n:[^{}]+$/

export function isValidVocalToken(token: string): boolean {
  return BEAT_RE.test(token) || NOTE_RE.test(token)
}

export function isNoteToken(token: string): boolean {
  return NOTE_RE.test(token)
}

export function noteText(token: string): string {
  return token.startsWith('n:') ? token.slice(2) : token
}

export type VocalCategory = 'beat' | 'note'

export interface VocalTokenMeta {
  token: string
  symbol: string
  label: string
  category: VocalCategory
  position: 'above' | 'below'
}

export const VOCAL_TOKEN_CATALOG: VocalTokenMeta[] = [
  { token: '1', symbol: '1', label: 'Taktanfang', category: 'beat', position: 'below' },
]

const META_BY_TOKEN = new Map(VOCAL_TOKEN_CATALOG.map(m => [m.token, m]))

export function getVocalMeta(token: string): VocalTokenMeta | undefined {
  if (isNoteToken(token)) {
    const text = noteText(token)
    return { token, symbol: text, label: text, category: 'note', position: 'above' }
  }
  return META_BY_TOKEN.get(token)
}
