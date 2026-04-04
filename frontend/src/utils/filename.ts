export interface SelectedSection {
  name: string
  shortcode: string
  num: number // 0 = no number
}

export interface SectionOption {
  name: string
  shortcode: string
  max_num: number
  sort_order: number
}

export interface VoiceOption {
  key: string    // shortcode, z.B. "S", "A", "Git"
  label: string  // Anzeigename, z.B. "Sopran", "Gitarre"
  sort_order: number
}

export interface ParsedFilename {
  voices: string[]
  sections: SelectedSection[]
  songName: string
}

/**
 * Parse a filename back into its voice, section, and song name components.
 * Mirrors the backend filename_parser logic.
 */
export function parseFilename(
  filename: string,
  folderName: string,
  voiceOptions: VoiceOption[],
  sectionOptions: SectionOption[],
): ParsedFilename {
  // Strip extension
  const dotIdx = filename.lastIndexOf('.')
  const name = dotIdx > 0 ? filename.substring(0, dotIdx) : filename

  // Split on hyphens; if no hyphens, split on spaces
  const parts = name.includes('-')
    ? name.split('-').filter(Boolean)
    : name.split(' ').filter(Boolean)

  if (parts.length === 0) return { voices: [], sections: [], songName: folderName }

  let idx = 0

  // First part: check if it's a voice shortcode combination
  const voices: string[] = []
  const singleCharKeys = voiceOptions.filter((v) => v.key.length === 1).map((v) => v.key)
  const multiCharKeys = voiceOptions.filter((v) => v.key.length > 1).map((v) => v.key)

  if (idx < parts.length) {
    const first = parts[idx]
    // Check multi-char voice key first (exact match)
    const multiMatch = multiCharKeys.find((k) => k.toLowerCase() === first.toLowerCase())
    if (multiMatch) {
      voices.push(multiMatch)
      idx++
    } else if (singleCharKeys.length > 0 && first.split('').every((ch) => singleCharKeys.includes(ch))) {
      // All characters are single-char voice keys
      const seen = new Set<string>()
      for (const ch of first) {
        if (!seen.has(ch)) {
          seen.add(ch)
          voices.push(ch)
        }
      }
      idx++
    }
  }

  // Skip folder name parts
  const folderParts = folderName
    .replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .split('-')
    .filter(Boolean)

  let songName = folderName
  if (folderParts.length > 0 && idx + folderParts.length <= parts.length) {
    const candidate = parts.slice(idx, idx + folderParts.length)
    if (candidate.every((c, i) => c.toLowerCase() === folderParts[i].toLowerCase())) {
      songName = candidate.join('-')
      idx += folderParts.length
    }
  }

  // Parse remaining parts as sections
  const sections: SelectedSection[] = []
  const remaining = parts.slice(idx)
  for (const part of remaining) {
    let matched = false
    for (const s of sectionOptions) {
      const code = s.shortcode || s.name
      const re = new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)?$`, 'i')
      const m = part.match(re)
      if (m) {
        sections.push({ name: s.name, shortcode: code, num: m[1] ? Number(m[1]) : 0 })
        matched = true
        break
      }
    }
    if (!matched) {
      // Unrecognized part — include in songName
      songName = songName ? `${songName}-${part}` : part
    }
  }

  return { voices, sections, songName }
}

export function buildFilename(
  voiceShortcodes: string[],
  sections: SelectedSection[],
  freeText: string,
  folderName: string,
  ext: string,
  voiceOptions?: VoiceOption[],
): string {
  const parts: string[] = []

  // Shortcodes nach sort_order sortieren (falls voiceOptions gegeben), sonst alphabetisch
  const sorted = voiceOptions
    ? voiceOptions
        .filter((v) => voiceShortcodes.includes(v.key))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((v) => v.key)
    : [...voiceShortcodes].sort()
  const voiceStr = sorted.join('')
  if (voiceStr) parts.push(voiceStr)

  if (folderName) parts.push(folderName)

  for (const s of sections) {
    const code = s.shortcode || s.name
    parts.push(s.num ? `${code}${s.num}` : code)
  }

  const clean = freeText
    .trim()
    .replace(/[^a-zA-Z0-9äöüÄÖÜß-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (clean) parts.push(clean)

  if (parts.length === 0) {
    const now = new Date()
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `Aufnahme_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.${ext}`
  }

  return `${parts.join('-')}.${ext}`
}
