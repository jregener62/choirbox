export const VOICE_COLORS: Record<string, string> = {
  S: 'var(--sopran)',
  A: 'var(--alt)',
  T: 'var(--tenor)',
  B: 'var(--bass)',
}

/** Raw hex values for backgrounds (CSS vars can't be used with rgba) */
export const VOICE_BG: Record<string, string> = {
  S: 'rgba(236,72,153,0.15)',
  A: 'rgba(249,115,22,0.15)',
  T: 'rgba(59,130,246,0.15)',
  B: 'rgba(34,197,94,0.15)',
}

const MULTI_COLOR = 'var(--satb)'
const MULTI_BG = 'rgba(139,92,246,0.15)'

export function voiceColor(voiceKey: string): string {
  if (voiceKey.length === 1) return VOICE_COLORS[voiceKey] || MULTI_COLOR
  return MULTI_COLOR
}

export function voiceBg(voiceKey: string): string {
  if (voiceKey.length === 1) return VOICE_BG[voiceKey] || MULTI_BG
  return MULTI_BG
}

const VOICE_FULL: Record<string, string> = {
  S: 'Sopran',
  A: 'Alt',
  T: 'Tenor',
  B: 'Bass',
}

export function voiceFullName(voiceKey: string): string {
  if (voiceKey.length === 1) return VOICE_FULL[voiceKey] || voiceKey
  return voiceKey.split('').map((v) => VOICE_FULL[v] || v).join('/')
}
