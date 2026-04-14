import { api } from './client'

export type DraftKind = 'document' | 'path'

export interface DraftEntry {
  id: number
  kind: DraftKind
  ref: string
  created_by: string | null
  created_at: string | null
}

export interface DraftSet {
  paths: Set<string>
  docIds: Set<number>
}

function normalizePath(path: string): string {
  let p = (path || '').trim()
  if (!p.startsWith('/')) p = '/' + p
  p = p.replace(/\/+$/, '')
  return p.toLowerCase()
}

export function toDraftSet(entries: DraftEntry[]): DraftSet {
  const paths = new Set<string>()
  const docIds = new Set<number>()
  for (const e of entries) {
    if (e.kind === 'document') {
      const n = Number(e.ref)
      if (Number.isFinite(n)) docIds.add(n)
    } else if (e.kind === 'path') {
      paths.add(normalizePath(e.ref))
    }
  }
  return { paths, docIds }
}

export async function listDrafts(): Promise<DraftEntry[]> {
  const res = await api<{ drafts: DraftEntry[] }>('/drafts')
  return res.drafts ?? []
}

export async function setDraft(kind: DraftKind, ref: string): Promise<void> {
  await api('/drafts', { method: 'POST', body: { kind, ref } })
}

export async function unsetDraft(kind: DraftKind, ref: string): Promise<void> {
  await api('/drafts', { method: 'DELETE', body: { kind, ref } })
}

export { normalizePath as normalizeDraftPath }
