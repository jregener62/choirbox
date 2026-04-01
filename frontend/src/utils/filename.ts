export const VOICES = [
  { key: 'S', label: 'Sopran' },
  { key: 'A', label: 'Alt' },
  { key: 'T', label: 'Tenor' },
  { key: 'B', label: 'Bass' },
] as const

export const SECTIONS = [
  { name: 'Intro', maxNum: 0 },
  { name: 'Strophe', maxNum: 5 },
  { name: 'Refrain', maxNum: 4 },
  { name: 'Bridge', maxNum: 4 },
  { name: 'Outro', maxNum: 0 },
] as const

export interface SelectedSection {
  name: string
  num: number // 0 = no number
}

export function buildFilename(
  voices: string[],
  sections: SelectedSection[],
  freeText: string,
  folderName: string,
  ext: string,
): string {
  const parts: string[] = []

  const order = ['S', 'A', 'T', 'B']
  const voiceStr = order.filter((v) => voices.includes(v)).join('')
  if (voiceStr) parts.push(voiceStr)

  if (folderName) parts.push(folderName)

  for (const s of sections) {
    parts.push(s.num ? `${s.name}${s.num}` : s.name)
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
