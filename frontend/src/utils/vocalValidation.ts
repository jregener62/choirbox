/**
 * Vocal-instruction token vocabulary — Phase 1 scope.
 *
 * Tokens use ChordPro brace syntax `{v:token}` with ChoirBox-specific
 * values. Current scope: beat marker and interval jumps. Additional
 * ABC-notation decorations (breath, fermata, dynamics ...) will be
 * added later as new toolbar tools.
 */

export const INTERVAL_RE = /^[+-]([1-9]|1[0-2])$/
export const BEAT_RE = /^1$/
export const NOTE_RE = /^n:[^{}]+$/

export function isValidVocalToken(token: string): boolean {
  return INTERVAL_RE.test(token) || BEAT_RE.test(token) || NOTE_RE.test(token)
}

/** True for `{v:n:...}` free-text comment tokens. */
export function isNoteToken(token: string): boolean {
  return NOTE_RE.test(token)
}

/** Extract the free-text payload from a note token (`n:Hello` → `Hello`). */
export function noteText(token: string): string {
  return token.startsWith('n:') ? token.slice(2) : token
}

export type VocalCategory = 'beat' | 'interval' | 'note'

export interface VocalTokenMeta {
  token: string
  symbol: string
  label: string
  category: VocalCategory
  /** above or below the lyric line (only relevant for overlay marks —
   *  currently unused as all Phase-1 tokens render inline or as underline). */
  position: 'above' | 'below'
}

/** Catalog used by the toolbar preview and the renderer. */
export const VOCAL_TOKEN_CATALOG: VocalTokenMeta[] = [
  { token: '1', symbol: '1', label: 'Taktanfang', category: 'beat', position: 'below' },
  ...Array.from({ length: 12 }, (_, i) => i + 1).flatMap(n => ([
    { token: `+${n}`, symbol: `↑${n}`, label: `Intervall +${n}`, category: 'interval' as VocalCategory, position: 'above' as const },
    { token: `-${n}`, symbol: `↓${n}`, label: `Intervall -${n}`, category: 'interval' as VocalCategory, position: 'above' as const },
  ])),
]

const META_BY_TOKEN = new Map(VOCAL_TOKEN_CATALOG.map(m => [m.token, m]))

export function getVocalMeta(token: string): VocalTokenMeta | undefined {
  if (isNoteToken(token)) {
    const text = noteText(token)
    return {
      token,
      symbol: text,
      label: text,
      category: 'note',
      position: 'above',
    }
  }
  return META_BY_TOKEN.get(token)
}

/** Build an interval token from direction + positive number 1..12. */
export function intervalToken(dir: '+' | '-', n: number): string {
  return `${dir}${n}`
}
