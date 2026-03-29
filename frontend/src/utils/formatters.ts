/**
 * Format seconds to mm:ss display.
 */
export function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|flac|aac|webm|mp4)$/i
const VOICE_PREFIX = /^[SATB]+-/

/**
 * Middle-truncate a string: "Alle meine Entchen" → "Alle mei...ntchen"
 */
export function middleTruncate(text: string, maxLen: number = 18): string {
  if (text.length <= maxLen) return text
  const keep = maxLen - 3
  const front = Math.ceil(keep / 2)
  const back = Math.floor(keep / 2)
  return text.slice(0, front) + '\u2026' + text.slice(-back)
}

/**
 * Format a filename for display: strip extension, voice prefix, replace hyphens with spaces.
 * "S-Believer-Refrain.mp3" → "Believer Refrain"
 * "SATB-Africa.mp3" → "Africa"
 * "Piano-Intro.mp3" → "Piano Intro"
 */
export function formatDisplayName(filename: string): string {
  let name = filename.replace(AUDIO_EXT, '')
  name = name.replace(VOICE_PREFIX, '')
  return name.replace(/-/g, ' ')
}
