import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { parseRtf } from '@/utils/rtfParser'
import { RtfPagedView } from '@/components/ui/RtfPagedView.tsx'
import type { Stroke } from '@/types/index.ts'

interface Bundle {
  content: string
  strokes: Stroke[]
  doc_name: string
}

declare global {
  interface Window {
    __rtfPrintReady?: boolean
    __rtfPrintError?: string
  }
}

/** "Naked" Print-Page — kein AppShell, kein AuthGuard. Wird vom server-
 *  seitigen PDF-Generator (Playwright) in headless Chromium aufgerufen.
 *  Authentifiziert sich via kurzlebigen, an doc_id+user_id gebundenen
 *  Print-Token, laedt RTF-Inhalt + Annotations und triggert nach
 *  abgeschlossener Pagination ``window.__rtfPrintReady = true``. */
export function RtfPrintPage() {
  const { docId } = useParams<{ docId: string }>()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [bundle, setBundle] = useState<Bundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!docId || !token) {
      setError('Token fehlt')
      window.__rtfPrintError = 'no_token'
      return
    }
    let cancelled = false
    fetch(`/api/documents/print/${docId}/bundle?token=${encodeURIComponent(token)}`)
      .then(async (resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        return resp.json() as Promise<Bundle>
      })
      .then((data) => {
        if (!cancelled) setBundle(data)
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'Bundle-Load fehlgeschlagen'
        setError(msg)
        window.__rtfPrintError = msg
      })
    return () => { cancelled = true }
  }, [docId, token])

  const paragraphs = useMemo(() => {
    if (!bundle) return null
    try {
      return parseRtf(bundle.content).paragraphs
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'RTF-Parse-Fehler'
      setError(msg)
      window.__rtfPrintError = msg
      return null
    }
  }, [bundle])

  const handlePaginated = () => {
    window.__rtfPrintReady = true
    // Marker-Element fuer Playwright — wait_for_selector statt
    // wait_for_function (CSP blockt eval).
    if (!document.getElementById('rtf-print-ready')) {
      const marker = document.createElement('div')
      marker.id = 'rtf-print-ready'
      marker.setAttribute('data-print-ready', '')
      marker.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;'
      document.body.appendChild(marker)
    }
  }

  if (error) {
    return <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#b91c1c' }}>Fehler: {error}</div>
  }
  if (!bundle || !paragraphs) {
    return <div style={{ padding: 24, fontFamily: 'sans-serif', color: '#666' }}>Lade…</div>
  }
  return (
    <div className="rtf-print-host">
      {/* Companion-PDF wird ohne Annotations gerendert — Annotations werden
       *  vom User auf der fertigen PDF gemacht (PDF-Annotations-Pipeline). */}
      <RtfPagedView
        paragraphs={paragraphs}
        fontSize={16}
        onPaginated={handlePaginated}
      />
    </div>
  )
}
