import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { RtfParagraph } from '@/utils/rtfParser'
import { paragraphsToVirtualLines, type VirtualLine } from '@/utils/rtfRender'
import { getSvgPathFromStroke } from '@/utils/strokeUtils.ts'
import type { Stroke } from '@/types/index.ts'

interface PageInfo {
  lines: VirtualLine[]
  measureYStart: number
  measureYHeight: number
}

interface Props {
  paragraphs: RtfParagraph[]
  fontSize?: number
  scrollContainerRef?: React.RefObject<HTMLElement | null>
  strokes?: Stroke[]
  onPaginated?: (pageCount: number) => void
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

const ANNOTATION_VIEWBOX_W = 1000

interface AnchoredRender {
  /** Index der Seite, auf der dieser Stroke landet. */
  pageIdx: number
  /** Position innerhalb von .rtf-page-content (CSS-Pixel). */
  left: number
  top: number
  width: number
  height: number
  /** ViewBox des Per-Stroke-SVGs (Stroke-bbox in vb-Koordinaten). */
  vbX: number
  vbY: number
  vbW: number
  vbH: number
  d: string
  color: string
}

export function RtfPagedView({
  paragraphs,
  fontSize = 16,
  scrollContainerRef,
  strokes,
  onPaginated,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const wrapperRefs = useRef<Array<HTMLDivElement | null>>([])
  const [scale, setScale] = useState(1)
  const [pages, setPages] = useState<PageInfo[]>([])
  const [anchoredRenders, setAnchoredRenders] = useState<AnchoredRender[]>([])

  const { mainLines, footerLines } = useMemo(() => {
    const all = paragraphsToVirtualLines(paragraphs)
    const main: VirtualLine[] = []
    const foot: VirtualLine[] = []
    for (const l of all) {
      if (l.isFooter) foot.push(l)
      else main.push(l)
    }
    return { mainLines: main, footerLines: foot }
  }, [paragraphs])

  // Strokes nach Anchor-Vorhandensein splitten — Altbestand (kein Anchor) wird
  // weiter via viewBox-Cropping pro Seite gerendert; neue, semantisch
  // verankerte Strokes pro Stueck per Line-Lookup.
  const { anchoredStrokes, unanchoredStrokes } = useMemo(() => {
    const anchored: Stroke[] = []
    const un: Stroke[] = []
    for (const s of strokes ?? []) {
      if (s.anchor && s.points && s.points.length > 0) anchored.push(s)
      else un.push(s)
    }
    return { anchoredStrokes: anchored, unanchoredStrokes: un }
  }, [strokes])

  // Pfade pro Stroke vorberechnen (perfect-freehand ist nicht billig).
  const strokePathCache = useMemo(() => {
    const cache = new Map<string, string>()
    for (const s of strokes ?? []) {
      const d = getSvgPathFromStroke(s.points, s.width, s.tool)
      if (d) cache.set(s.id, d)
    }
    return cache
  }, [strokes])

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

  useLayoutEffect(() => {
    const el = measureRef.current
    if (!el || mainLines.length === 0) {
      setPages([])
      return
    }
    const children = Array.from(el.children) as HTMLElement[]
    if (children.length !== mainLines.length) return

    interface Building { lines: VirtualLine[]; startTop: number; endTop: number }
    const result: Building[] = [{ lines: [], startTop: children[0].offsetTop, endTop: children[0].offsetTop }]
    let pageStartTop = children[0].offsetTop
    for (let i = 0; i < children.length; i++) {
      const c = children[i]
      const line = mainLines[i]
      if (line.isPageBreak) {
        if (result[result.length - 1].lines.length > 0) {
          result.push({ lines: [], startTop: c.offsetTop + c.offsetHeight, endTop: c.offsetTop + c.offsetHeight })
          pageStartTop = c.offsetTop + c.offsetHeight
        }
        continue
      }
      const relBottom = c.offsetTop + c.offsetHeight - pageStartTop
      if (relBottom > CONTENT_H_PX && result[result.length - 1].lines.length > 0) {
        result.push({ lines: [], startTop: c.offsetTop, endTop: c.offsetTop })
        pageStartTop = c.offsetTop
      }
      const cur = result[result.length - 1]
      cur.lines.push(line)
      cur.endTop = c.offsetTop + c.offsetHeight
    }
    setPages(
      result
        .filter((p) => p.lines.length > 0)
        .map((p) => ({
          lines: p.lines,
          measureYStart: p.startTop,
          measureYHeight: Math.max(0, p.endTop - p.startTop),
        })),
    )
  }, [mainLines, fontSize])

  // Anchored-Strokes positionieren: Zeile (data-line-key) im sichtbaren Page-
  // Content nachschlagen, Stroke-SVG relativ zur Zeilen-bbox plazieren.
  // Skaliert die x-Achse mit lineWidthPx, damit ein Underline in einer
  // schmaleren Zeile proportional kuerzer wird.
  useLayoutEffect(() => {
    if (anchoredStrokes.length === 0 || pages.length === 0) {
      setAnchoredRenders([])
      return
    }
    const out: AnchoredRender[] = []
    for (const s of anchoredStrokes) {
      const a = s.anchor!
      // Zeile auf einer der Seiten finden
      let pageIdx = -1
      let lineEl: HTMLElement | null = null
      let pageContentEl: HTMLElement | null = null
      for (let p = 0; p < pages.length; p++) {
        const wrapper = wrapperRefs.current[p]
        if (!wrapper) continue
        const found = wrapper.querySelector<HTMLElement>(`[data-line-key="${CSS.escape(a.lineKey)}"]`)
        if (found) {
          pageIdx = p
          lineEl = found
          pageContentEl = wrapper.querySelector<HTMLElement>('.rtf-page-content')
          break
        }
      }
      if (pageIdx < 0 || !lineEl || !pageContentEl) continue

      // Zeile + Page-Content in Doc-Koordinaten messen.
      const lineRect = lineEl.getBoundingClientRect()
      const contentRect = pageContentEl.getBoundingClientRect()
      // .rtf-page hat transform: scale(scale) — getBoundingClientRect liefert
      // bereits die VISUELLEN, skalierten Werte. Da wir aber innerhalb des
      // (ungescalten) .rtf-page-content positionieren, muessen wir mit dem
      // Inversen wieder hochrechnen.
      const inv = scale > 0 ? 1 / scale : 1
      const lineLeftInContent = (lineRect.left - contentRect.left) * inv
      const lineTopInContent = (lineRect.top - contentRect.top) * inv
      const lineWidth = lineRect.width * inv
      const xScale = a.lineWidthPx > 0 ? lineWidth / a.lineWidthPx : 1
      const left = lineLeftInContent + a.bboxLeftPx * xScale
      const top = lineTopInContent + a.bboxTopPx
      const width = a.bboxWidthPx * xScale
      const height = a.bboxHeightPx
      // ViewBox des Per-Stroke-SVGs aus den gespeicherten Punkten.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of s.points) {
        if (p[0] < minX) minX = p[0]
        if (p[0] > maxX) maxX = p[0]
        if (p[1] < minY) minY = p[1]
        if (p[1] > maxY) maxY = p[1]
      }
      const d = strokePathCache.get(s.id)
      if (!d) continue
      out.push({
        pageIdx,
        left, top, width, height,
        vbX: minX, vbY: minY, vbW: maxX - minX, vbH: maxY - minY,
        d, color: s.color,
      })
    }
    setAnchoredRenders(out)
  }, [anchoredStrokes, pages, strokePathCache, scale])

  // Pagination-Ready-Signal — nach Pagination + Anchor-Mapping, damit der
  // PDF-Generator (Playwright) erst den Marker setzt, wenn alles platziert ist.
  useEffect(() => {
    if (pages.length === 0) return
    if (!onPaginated) return
    const id = requestAnimationFrame(() => onPaginated(pages.length))
    return () => cancelAnimationFrame(id)
  }, [pages.length, anchoredRenders.length, onPaginated])

  // Pfade fuer unanchored-Strokes (Altbestand).
  const unanchoredPaths = useMemo(() => {
    return unanchoredStrokes
      .map((s) => ({ d: strokePathCache.get(s.id) ?? '', color: s.color }))
      .filter((p) => p.d)
  }, [unanchoredStrokes, strokePathCache])

  const wrapperW = PAGE_W_PX * scale
  const wrapperH = PAGE_H_PX * scale
  const vbPerMeasurePx = ANNOTATION_VIEWBOX_W / CONTENT_W_PX

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
      <div
        ref={measureRef}
        className="rtf-paged-measure rtf-viewer-content"
        style={{ width: CONTENT_W_PX, fontSize }}
      >
        {mainLines.map((l) => l.node)}
      </div>

      {pages.map((page, idx) => {
        const pageVbY = page.measureYStart * vbPerMeasurePx
        const pageVbH = page.measureYHeight * vbPerMeasurePx
        const pageAnchored = anchoredRenders.filter((a) => a.pageIdx === idx)
        return (
          <div
            key={idx}
            className="rtf-paged-wrapper"
            ref={(el) => { wrapperRefs.current[idx] = el }}
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
                {page.lines.map((l) => l.node)}
                {/* Altbestand: ein SVG ueber die Seite, viewBox auf den Seiten-y-Bereich gecropt */}
                {unanchoredPaths.length > 0 && pageVbH > 0 && (
                  <svg
                    className="rtf-page-annotations"
                    viewBox={`0 ${pageVbY} ${ANNOTATION_VIEWBOX_W} ${pageVbH}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {unanchoredPaths.map((p, i) => (
                      <path key={i} d={p.d} fill={p.color} />
                    ))}
                  </svg>
                )}
                {/* Semantisch verankerte Strokes: pro Stueck eigenes SVG, an die Zeile gepinnt */}
                {pageAnchored.map((s, i) => (
                  <svg
                    key={`a-${i}`}
                    className="rtf-page-annotation-anchored"
                    viewBox={`${s.vbX} ${s.vbY} ${s.vbW} ${s.vbH}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: s.left,
                      top: s.top,
                      width: s.width,
                      height: s.height,
                      pointerEvents: 'none',
                      overflow: 'visible',
                    }}
                  >
                    <path d={s.d} fill={s.color} />
                  </svg>
                ))}
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
        )
      })}
      {pages.length === 0 && mainLines.length > 0 && (
        <div className="pdf-upload">
          <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Seiten berechnen...</span>
        </div>
      )}
    </div>
  )
}
