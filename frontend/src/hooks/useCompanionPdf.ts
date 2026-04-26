import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/api/client.ts'

export type CompanionPdfStatus = 'pending' | 'ready' | 'failed' | null

interface CompanionPdfState {
  status: CompanionPdfStatus
  companionDocId: number | null
  companionPageCount: number
  annotationsStale: boolean
  /** Manuell triggern (z.B. nach Save), damit nicht auf den naechsten
   *  Polling-Tick gewartet werden muss. */
  refresh: () => Promise<void>
  clearStale: () => Promise<void>
}

interface ApiResponse {
  status: 'pending' | 'ready' | 'failed' | null
  companion_doc_id: number | null
  companion_page_count: number
  annotations_stale: boolean
}

const POLL_INTERVAL_MS = 1500

/** Liest den Status der Companion-PDF-Generierung fuer ein RTF-Dokument
 *  und pollt waehrend `status === "pending"` bis zum Erfolg/Fehler.
 *  Liefert die Companion-Document-id, sodass die UI die PDF-Anzeige
 *  (PdfPages) auf das fertige PDF wechseln kann. */
export function useCompanionPdf(rtfDocId: number | null, enabled: boolean): CompanionPdfState {
  const [status, setStatus] = useState<CompanionPdfStatus>(null)
  const [companionDocId, setCompanionDocId] = useState<number | null>(null)
  const [companionPageCount, setCompanionPageCount] = useState(0)
  const [annotationsStale, setAnnotationsStale] = useState(false)
  const cancelledRef = useRef(false)
  const timerRef = useRef<number | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!rtfDocId) return
    try {
      const data = await api<ApiResponse>(`/documents/${rtfDocId}/pdf-status`, { silent: true })
      if (cancelledRef.current) return
      setStatus(data.status)
      setCompanionDocId(data.companion_doc_id)
      setCompanionPageCount(data.companion_page_count)
      setAnnotationsStale(data.annotations_stale)
      if (data.status === 'pending') {
        timerRef.current = window.setTimeout(fetchStatus, POLL_INTERVAL_MS)
      }
    } catch {
      if (!cancelledRef.current) setStatus('failed')
    }
  }, [rtfDocId])

  useEffect(() => {
    cancelledRef.current = false
    if (!enabled || !rtfDocId) {
      setStatus(null)
      setCompanionDocId(null)
      setCompanionPageCount(0)
      setAnnotationsStale(false)
      return
    }
    fetchStatus()
    return () => {
      cancelledRef.current = true
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [rtfDocId, enabled, fetchStatus])

  const clearStale = useCallback(async () => {
    if (!rtfDocId) return
    try {
      await api(`/documents/${rtfDocId}/clear-stale-annotations`, { method: 'POST', silent: true })
      setAnnotationsStale(false)
    } catch {
      /* schluck — ist nur UI-Komfort */
    }
  }, [rtfDocId])

  return { status, companionDocId, companionPageCount, annotationsStale, refresh: fetchStatus, clearStale }
}
