/**
 * Parse a normalized choirbox filename into voice parts and sections.
 *
 * Naming convention (from RecordingModal buildFilename):
 *   {voices}-{folderName}-{section1}-{section2}-{freeText}.mp3
 *
 * Examples:
 *   "A-Believer-Refrain.mp3"          → voices: ['A'], sections: ['Refrain']
 *   "SA-Believer-Strophe1+2.mp3"      → voices: ['S','A'], sections: ['Strophe1+2']
 *   "SATB-Africa.mp3"                  → voices: ['S','A','T','B'], sections: ['Gesamt']
 *   "T-Paradise-Bridge.mp3"           → voices: ['T'], sections: ['Bridge']
 */

export interface ParsedTrack {
  voices: string[]   // individual letters: ['S'], ['S','A','T','B']
  voiceKey: string   // joined: 'S', 'SA', 'SATB'
  sections: string[] // ['Strophe1', 'Refrain2']
  sectionKey: string // 'Strophe1+Refrain2' or 'Gesamt'
  freeText: string   // trailing unrecognized parts
}

const AUDIO_EXT_RE = /\.(mp3|m4a|wav|ogg|flac|aac|webm|mp4)$/i
const DEFAULT_SECTION_RE = /^(Intro|Strophe|Refrain|Bridge|Solo|Outro)(\d[\+\d]*)?$/i

function buildSectionRegex(shortcodes: string[]): RegExp {
  if (shortcodes.length === 0) return DEFAULT_SECTION_RE
  const escaped = shortcodes.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  return new RegExp(`^(${escaped.join('|')})(\\d[\\+\\d]*)?$`, 'i')
}

function buildVoiceRegex(shortcodes: string[]): RegExp {
  if (shortcodes.length === 0) return /^[SATB]+$/
  const escaped = shortcodes.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  // Single-char shortcodes can be combined (SA, SAT), multi-char match as whole
  const singleChars = escaped.filter((s) => s.length === 1)
  const multiWords = escaped.filter((s) => s.length > 1)
  const parts: string[] = []
  if (singleChars.length > 0) parts.push(`[${singleChars.join('')}]+`)
  for (const w of multiWords) parts.push(w)
  return new RegExp(`^(${parts.join('|')})$`, singleChars.length > 0 ? '' : 'i')
}

export function parseTrackFilename(
  filename: string,
  folderName: string,
  voiceShortcodes?: string[],
  sectionShortcodes?: string[],
): ParsedTrack | null {
  // Strip extension
  const name = filename.replace(AUDIO_EXT_RE, '')
  if (name === filename && !AUDIO_EXT_RE.test(filename)) return null

  const parts = name.split('-').filter(Boolean)
  if (parts.length === 0) return null

  // First part must be voice shortcode
  const firstPart = parts[0]
  const voiceRe = buildVoiceRegex(voiceShortcodes || [])

  if (!voiceRe.test(firstPart)) return null

  // For single-char shortcodes, split into individual letters; otherwise keep as-is
  const singleChars = (voiceShortcodes || ['S', 'A', 'T', 'B']).filter((s) => s.length === 1)
  const voiceOrder = voiceShortcodes || ['S', 'A', 'T', 'B']
  let voiceLetters: string[]
  if (singleChars.length > 0 && singleChars.some((c) => firstPart.includes(c))) {
    voiceLetters = [...new Set(firstPart.split(''))]
      .sort((a, b) => voiceOrder.indexOf(a) - voiceOrder.indexOf(b))
  } else {
    voiceLetters = [firstPart]
  }
  const voiceKey = voiceLetters.join('')

  // Remaining parts after voice
  let rest = parts.slice(1)

  // Try to match and skip folder name parts
  // Folder name is sanitized with hyphens, e.g., "Wanna-Be-Happy-Kirk-Franklin"
  const folderParts = folderName
    .trim()
    .replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .filter(Boolean)

  if (folderParts.length > 0 && rest.length >= folderParts.length) {
    const candidateSlice = rest.slice(0, folderParts.length)
    const matches = candidateSlice.every(
      (p, i) => p.toLowerCase() === folderParts[i].toLowerCase(),
    )
    if (matches) {
      rest = rest.slice(folderParts.length)
    }
  }

  // Parse sections from remaining parts
  const sectionRe = buildSectionRegex(sectionShortcodes || [])
  const sections: string[] = []
  const freeTextParts: string[] = []

  for (const part of rest) {
    const m = part.match(sectionRe)
    if (m) {
      const sectionName = m[1]
      const num = m[2] || ''
      sections.push(sectionName + num)
    } else {
      freeTextParts.push(part)
    }
  }

  const sectionKey = sections.length > 0 ? sections.join('+') : 'Gesamt'
  const freeText = freeTextParts.join('-')

  return {
    voices: voiceLetters,
    voiceKey,
    sections: sections.length > 0 ? sections : ['Gesamt'],
    sectionKey,
    freeText,
  }
}
