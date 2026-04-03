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
