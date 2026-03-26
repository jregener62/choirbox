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

const VOICE_RE = /^[SATB]+$/
const SECTION_RE = /^(Intro|Strophe|Refrain|Bridge|Outro)(\d[\+\d]*)?$/i
const AUDIO_EXT_RE = /\.(mp3|m4a|wav|ogg|flac|aac|webm|mp4)$/i
const VOICE_ORDER = 'SATB'
const SPECIAL_VOICE_RE = /^(Piano)$/i

export function parseTrackFilename(
  filename: string,
  folderName: string,
): ParsedTrack | null {
  // Strip extension
  const name = filename.replace(AUDIO_EXT_RE, '')
  if (name === filename && !AUDIO_EXT_RE.test(filename)) return null

  const parts = name.split('-').filter(Boolean)
  if (parts.length === 0) return null

  // First part must be voice letters or special voice
  const firstPart = parts[0]

  if (SPECIAL_VOICE_RE.test(firstPart)) {
    // Piano/instrumental — don't show in grid
    return null
  }

  if (!VOICE_RE.test(firstPart)) return null

  // Extract and sort voice letters
  const voiceLetters = [...new Set(firstPart.split(''))]
    .sort((a, b) => VOICE_ORDER.indexOf(a) - VOICE_ORDER.indexOf(b))
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
  const sections: string[] = []
  const freeTextParts: string[] = []

  for (const part of rest) {
    const m = part.match(SECTION_RE)
    if (m) {
      // Normalize: capitalize first letter
      const sectionName = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()
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
