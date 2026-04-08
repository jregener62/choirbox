import { api, apiUpload } from '@/api/client'
import type { ChordSheet, ChordSheetParseResult, ParsedChordContent } from '@/types/index'

export async function parsePdf(file: File): Promise<ChordSheetParseResult> {
  const formData = new FormData()
  formData.append('file', file)
  return apiUpload<ChordSheetParseResult>('/chord-sheets/import/parse', formData)
}

export async function saveChordSheet(data: {
  folder: string
  title: string
  original_key: string
  parsed_content: ParsedChordContent
  source_filename: string
}): Promise<ChordSheet> {
  return api<ChordSheet>('/chord-sheets/import', {
    method: 'POST',
    body: data,
  })
}

export async function importFromText(data: {
  folder: string
  title: string
  text: string
}): Promise<ChordSheet> {
  return api<ChordSheet>('/chord-sheets/import/text', {
    method: 'POST',
    body: data,
  })
}

export async function listChordSheets(folder: string): Promise<ChordSheet[]> {
  return api<ChordSheet[]>(`/chord-sheets/list?folder=${encodeURIComponent(folder)}`)
}

export async function getChordSheet(id: number): Promise<ChordSheet> {
  return api<ChordSheet>(`/chord-sheets/${id}`)
}

export async function updateChordSheet(
  id: number,
  data: { title?: string; parsed_content?: ParsedChordContent; original_key?: string },
): Promise<ChordSheet> {
  return api<ChordSheet>(`/chord-sheets/${id}`, {
    method: 'PUT',
    body: data,
  })
}

export async function deleteChordSheet(id: number): Promise<void> {
  return api<void>(`/chord-sheets/${id}`, { method: 'DELETE' })
}

export async function saveTransposition(
  chordSheetId: number,
  semitones: number,
): Promise<void> {
  return api<void>(`/chord-sheets/${chordSheetId}/preference`, {
    method: 'PUT',
    body: { semitones },
  })
}
