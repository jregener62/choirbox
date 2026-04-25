import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/api/client.ts'
import { parseRtf } from '@/utils/rtfParser'
import { paragraphsToVirtualLines, type VirtualLine } from '@/utils/rtfRender'

interface RtfPagedViewerProps {
  docId: number
  fontSize?: number
  scrollContainerRef?: React.RefObject<HTMLElement | null>
}

const PAGE_W_MM = 210
const PAGE_H_MM = 297
const PAGE_PAD_MM = 18
const FOOTER_H_MM = 16
const FOOTER_GAP_MM = 4
const MM_PER_PX = 25.4 / 96

const PAGE_W_PX = PAGE_W_MM / MM_PER_PX
const PAGE_H_PX = PAGE_H_MM / MM_PER_PX
const CONTENT_W_PX = (PAGE_W_MM - 2 * PAGE_PAD_MM) / MM_PER_PX
const CONTENT_H_PX = (PAGE_H_MM - 2 * PAGE_PAD_MM - FOOTER_H_MM - FOOTER_GAP_MM) / MM_PER_PX

export function RtfPagedViewer({ docId, fontSize = 16, scrollContainerRef }: RtfPagedViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [pages, setPages] = useState<VirtualLine[][]>([])

  useEffect(() => {
    let cancelled = false
    async function fetchContent() {
      try {
        const data = await api<{ content: string }>(`/documents/${docId}/content`)
        if (!cancelled) setContent(data.content)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'RTF konnte nicht geladen werden')
      }
    }
    fetchContent()
    return () => { cancelled = true }
  }, [docId])

  const parsed = useMemo(() => {
    if (content === null) return null
    try {
      return parseRtf(content)
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Parse-Fehler' }
    }
  }, [content])

  const { mainLines, footerLines } = useMemo(() => {
    if (!parsed || 'error' in parsed) return { mainLines: [] as VirtualLine[], footerLines: [] as VirtualLine[] }
    const all = paragraphsToVirtualLines(parsed.paragraphs)
    const main: VirtualLine[] = []
    const foot: VirtualLine[] = []
    for (const l of all) {
      if (l.isFooter) foot.push(l)
      else main.push(l)
    }
    return { mainLines: main, footerLines: foot }
  }, [parsed])

  // Container-Breite beobachten und Skalierung berechnen, damit eine A4-Seite
  // auf schmalen Viewports (Smartphone) komplett sichtbar bleibt.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => {
      const available = el.clientWidth - 16
      const s = Math.min(1, available / PAGE_W_PX)
      setScale(s > 0 ? s : 1)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Hauptzeilen ausmessen und auf Seiten verteilen. Misst immer bei voller
  // A4-Breite (CONTENT_W_PX) — Skalierung erfolgt rein visuell via transform,
  // sodass Seiten-Breaks viewportunabhaengig stabil bleiben.
  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el) {
      setPages([])
      return
    }
    if (mainLines.length === 0) {
      setPages([])
      return
    }
    const children = Array.from(el.children) as HTMLElement[]
    if (children.length !== mainLines.length) return

    const result: VirtualLine[][] = [[]]
    let pageStartTop = children[0].offsetTop
    for (let i = 0; i < children.length; i++) {
      const c = children[i]
      const line = mainLines[i]
      if (line.isPageBreak) {
        if (result[result.length - 1].length > 0) result.push([])
        pageStartTop = c.offsetTop + c.offsetHeight
        continue
      }
      const relBottom = c.offsetTop + c.offsetHeight - pageStartTop
      if (relBottom > CONTENT_H_PX && result[result.length - 1].length > 0) {
        result.push([])
        pageStartTop = c.offsetTop
      }
      result[result.length - 1].push(line)
    }
    setPages(result)
  }, [mainLines, fontSize])

  if (error) {
    return (
      <div className="pdf-upload">
        <div className="pdf-upload-text" style={{ color: 'var(--danger)' }}>{error}</div>
      </div>
    )
  }
  if (content === null || parsed === null) {
    return (
      <div className="pdf-upload">
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Text laden...</span>
      </div>
    )
  }
  if ('error' in parsed) {
    return (
      <div className="pdf-upload">
        <div className="pdf-upload-text" style={{ color: 'var(--danger)' }}>
          RTF-Parse-Fehler: {parsed.error}
        </div>
      </div>
    )
  }

  const wrapperW = PAGE_W_PX * scale
  const wrapperH = PAGE_H_PX * scale

  return (
    <div
      className="rtf-paged-container"
      ref={(el) => {
        containerRef.current = el
        if (scrollContainerRef) {
          (scrollContainerRef as React.MutableRefObject<HTMLElement | null>).current = el
        }
      }}
    >
      {/* Off-Screen Mess-Container in voller A4-Inhaltsbreite */}
      <div
        ref={measureRef}
        className="rtf-paged-measure rtf-viewer-content"
        style={{ width: CONTENT_W_PX, fontSize }}
      >
        {mainLines.map((l) => l.node)}
      </div>

      {pages.map((lines, idx) => (
        <div
          key={idx}
          className="rtf-paged-wrapper"
          style={{ width: wrapperW, height: wrapperH }}
        >
          <div
            className="rtf-page"
            style={{
              width: PAGE_W_PX,
              height: PAGE_H_PX,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              fontSize,
            }}
          >
            <div className="rtf-page-content">
              {lines.map((l) => l.node)}
            </div>
            <div className="rtf-page-footer">
              {footerLines.length > 0 && (
                <div className="rtf-page-footer-text">
                  {footerLines.map((l) => l.node)}
                </div>
              )}
              <div className="rtf-page-number">
                Seite {idx + 1} von {pages.length}
              </div>
            </div>
          </div>
        </div>
      ))}
      {pages.length === 0 && mainLines.length > 0 && (
        <div className="pdf-upload">
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Seiten berechnen...</span>
        </div>
      )}
    </div>
  )
}
