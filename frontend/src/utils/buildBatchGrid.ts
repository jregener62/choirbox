import type { DropboxEntry } from '@/types/index'
import { parseTrackFilename } from './parseTrackFilename'
import type { ParsedTrack } from './parseTrackFilename'

export interface GridCell {
  entry: DropboxEntry
  parsed: ParsedTrack
}

export interface BatchGridData {
  voiceColumns: string[]
  sectionRows: string[]
  cells: Map<string, GridCell>
  extraFiles: DropboxEntry[]
  folders: DropboxEntry[]
}

const SECTION_ORDER: Record<string, number> = {
  gesamt: 0,
  intro: 1,
  strophe: 2,
  refrain: 3,
  bridge: 4,
  outro: 5,
}

function sectionSortKey(sectionKey: string): string {
  // 'Strophe1+Refrain2' → sort by first section's order + number
  const first = sectionKey.split('+')[0]
  const m = first.match(/^([a-zA-Z]+)(\d*)$/)
  if (!m) return '9_' + sectionKey
  const name = m[1].toLowerCase()
  const num = m[2] || '0'
  const order = SECTION_ORDER[name] ?? 8
  return `${order}_${num.padStart(2, '0')}_${sectionKey}`
}

function voiceSortKey(voiceKey: string): string {
  // Single voices first in SATB order, then multi-voice by length
  if (voiceKey.length === 1) {
    const order = 'SATB'.indexOf(voiceKey)
    return `0_${order >= 0 ? order : 9}`
  }
  return `1_${voiceKey.length}_${voiceKey}`
}

export function buildBatchGrid(
  entries: DropboxEntry[],
  folderName: string,
): BatchGridData | null {
  const folders: DropboxEntry[] = []
  const extraFiles: DropboxEntry[] = []
  const cells = new Map<string, GridCell>()
  const voiceSet = new Set<string>()
  const sectionSet = new Set<string>()

  for (const entry of entries) {
    if (entry.type === 'folder') {
      folders.push(entry)
      continue
    }

    const parsed = parseTrackFilename(entry.name, folderName)
    if (!parsed) {
      extraFiles.push(entry)
      continue
    }

    const key = `${parsed.sectionKey}::${parsed.voiceKey}`

    // If there's already a file in this cell, put the duplicate in extras
    if (cells.has(key)) {
      extraFiles.push(entry)
      continue
    }

    cells.set(key, { entry, parsed })
    voiceSet.add(parsed.voiceKey)
    sectionSet.add(parsed.sectionKey)
  }

  // Need at least 2 parsed files for a meaningful grid
  if (cells.size < 2) return null

  const voiceColumns = [...voiceSet].sort(
    (a, b) => voiceSortKey(a).localeCompare(voiceSortKey(b)),
  )

  const sectionRows = [...sectionSet].sort(
    (a, b) => sectionSortKey(a).localeCompare(sectionSortKey(b)),
  )

  return { voiceColumns, sectionRows, cells, extraFiles, folders }
}

/** Format section key for display: 'Strophe1+Refrain2' → 'Strophe 1 + Refrain 2' */
export function formatSectionLabel(sectionKey: string): string {
  if (sectionKey === 'Gesamt') return 'Gesamt'
  return sectionKey
    .split('+')
    .map((s) => s.replace(/(\d)/, ' $1'))
    .join(' + ')
}

/** Map voice key to CSS color class suffix */
export function voiceColorClass(voiceKey: string): string {
  if (voiceKey.length === 1) {
    return { S: 's', A: 'a', T: 't', B: 'b' }[voiceKey] || 'satb'
  }
  return 'satb'
}

/** Human-readable voice label */
export function voiceLabel(voiceKey: string): string {
  if (voiceKey.length === 1) {
    return { S: 'S', A: 'A', T: 'T', B: 'B' }[voiceKey] || voiceKey
  }
  return voiceKey // 'SA', 'SAT', 'SATB'
}
