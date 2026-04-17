/**
 * Vocal-instruction token vocabulary.
 *
 * Tokens use ChordPro brace syntax `{v:token}`. Current scope:
 * - beat: `{v:1}` (Taktanfang / Zaehlzeit 1)
 * - note: `{v:n:<text>}` (Freitext-Kommentar)
 */

export const BEAT_RE = /^1$/
export const NOTE_RE = /^n:(?:[tib]:)?[^{}]+$/

export type NotePosition = 't' | 'i' | 'b'

export function isValidVocalToken(token: string): boolean {
  return BEAT_RE.test(token) || NOTE_RE.test(token)
}

export function isNoteToken(token: string): boolean {
  return NOTE_RE.test(token)
}

/** Extract position prefix from a note token. Defaults to 't' (top). */
export function notePosition(token: string): NotePosition {
  if (token.startsWith('n:t:')) return 't'
  if (token.startsWith('n:i:')) return 'i'
  if (token.startsWith('n:b:')) return 'b'
  return 't'
}

/** Extract the free-text payload from a note token. */
export function noteText(token: string): string {
  const m = token.match(/^n:(?:[tib]:)?(.+)$/)
  return m ? m[1] : token
}

/** Build a note token from position + text. */
export function buildNoteToken(pos: NotePosition, text: string): string {
  return `n:${pos}:${text}`
}

export type VocalCategory = 'beat' | 'note-top' | 'note-inline' | 'note-bottom'

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

const NOTE_CATEGORY_MAP: Record<NotePosition, VocalCategory> = {
  t: 'note-top',
  i: 'note-inline',
  b: 'note-bottom',
}
const NOTE_POSITION_MAP: Record<NotePosition, 'above' | 'below'> = {
  t: 'above',
  i: 'above',
  b: 'below',
}

export function getVocalMeta(token: string): VocalTokenMeta | undefined {
  if (isNoteToken(token)) {
    const text = noteText(token)
    const pos = notePosition(token)
    return {
      token,
      symbol: text,
      label: text,
      category: NOTE_CATEGORY_MAP[pos],
      position: NOTE_POSITION_MAP[pos],
    }
  }
  return META_BY_TOKEN.get(token)
}
