import { useCallback, useState, useEffect, useMemo, useRef } from 'react'
import { api } from '@/api/client.ts'
import { parseRtf } from '@/utils/rtfParser'
import { renderParagraph } from '@/utils/rtfRender'
import { useAnnotationStore } from '@/hooks/useAnnotations.ts'
import { toNormalized, getSvgPathFromStroke, getViewBoxHeight } from '@/utils/strokeUtils.ts'
import type { Stroke, StrokeAnchor } from '@/types/index.ts'

const ANNOTATION_PAGE = 1
const VIEWBOX_WIDTH = 1000

interface RtfViewerProps {
  docId: number
  fontSize?: number
  scrollContainerRef?: React.RefObject<HTMLElement | null>
}

export function RtfViewer({
  docId,
  fontSize = 16,
  scrollContainerRef,
}: RtfViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // --- Annotation state ---
  const contentRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const activePointersRef = useRef<Set<number>>(new Set())
  const wasPinchRef = useRef(false)
  const [viewBoxHeight, setViewBoxHeight] = useState(1414)
  /** Beim PointerDown gemerkte Doc-Zeile + ihre BoundingClientRect — wird im
   *  PointerUp benutzt, um den fertigen Stroke an die Zeile zu ankern. */
  const drawAnchorRef = useRef<{ lineKey: string; lineRect: DOMRect } | null>(null)

  const drawingMode = useAnnotationStore((s) => s.drawingMode)
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const activeStroke = useAnnotationStore((s) => s.activeStroke)
  const key = `${docId}::${ANNOTATION_PAGE}`
  const rawStrokes = useAnnotationStore((s) => s.pages[key])
  const strokes = useMemo(() => rawStrokes || [], [rawStrokes])

  const loadPage = useAnnotationStore((s) => s.loadPage)
  const setActiveStroke = useAnnotationStore((s) => s.setActiveStroke)
  const commitStroke = useAnnotationStore((s) => s.commitStroke)
  const eraseStroke = useAnnotationStore((s) => s.eraseStroke)

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

  // Gespeicherte Annotationen fuer dieses Dokument laden
  useEffect(() => {
    loadPage(docId, ANNOTATION_PAGE)
  }, [docId, loadPage])

  // Print-Hook: Chrome paginiert ein einzelnes grosses position:absolute SVG
  // nicht — Annotations auf Seite > 1 werden geclippt. Vor dem Druck zerlegen
  // wir das Overlay in viele kleine, einzeln positionierte SVGs (eines pro
  // Stroke), die als kleine Boxen sauber durch die Druckseiten paginieren.
  useEffect(() => {
    const handleBeforePrint = () => {
      const inner = contentRef.current
      const svg = svgRef.current
      if (!inner || !svg || strokes.length === 0) return
      const vb = svg.viewBox.baseVal
      if (vb.width === 0 || vb.height === 0) return

      svg.dataset.printHidden = '1'
      svg.style.display = 'none'

      for (const stroke of strokes) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const p of stroke.points) {
          if (p[0] < minX) minX = p[0]
          if (p[0] > maxX) maxX = p[0]
          if (p[1] < minY) minY = p[1]
          if (p[1] > maxY) maxY = p[1]
        }
        const pad = stroke.width * 2
        minX = Math.max(0, minX - pad)
        minY = Math.max(0, minY - pad)
        maxX = Math.min(vb.width, maxX + pad)
        maxY = Math.min(vb.height, maxY + pad)
        const vbW = maxX - minX
        const vbH = maxY - minY
        if (vbW <= 0 || vbH <= 0) continue

        const d = getSvgPathFromStroke(stroke.points, stroke.width, stroke.tool)
        if (!d) continue

        const sliceSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        sliceSvg.setAttribute('viewBox', `${minX} ${minY} ${vbW} ${vbH}`)
        sliceSvg.setAttribute('preserveAspectRatio', 'none')
        sliceSvg.classList.add('annotation-print-slice')
        // Prozent-Positionen, damit beim Reflow im Druck (andere Breite) jede
        // Slice an derselben proportionalen Stelle wie im Original-Overlay liegt.
        sliceSvg.style.cssText =
          `position: absolute;` +
          `top: ${(minY / vb.height) * 100}%;` +
          `left: ${(minX / vb.width) * 100}%;` +
          `width: ${(vbW / vb.width) * 100}%;` +
          `height: ${(vbH / vb.height) * 100}%;` +
          `pointer-events: none; overflow: visible;`

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        path.setAttribute('d', d)
        path.setAttribute('fill', stroke.color)
        sliceSvg.appendChild(path)

        inner.appendChild(sliceSvg)
      }
    }

    const handleAfterPrint = () => {
      const inner = contentRef.current
      if (inner) {
        inner.querySelectorAll('.annotation-print-slice').forEach((el) => el.remove())
      }
      const svg = svgRef.current
      if (svg && svg.dataset.printHidden) {
        svg.style.display = ''
        delete svg.dataset.printHidden
      }
    }

    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('afterprint', handleAfterPrint)
      handleAfterPrint()
    }
  }, [strokes])

  const parsed = useMemo(() => {
    if (content === null) return null
    try {
      return parseRtf(content)
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Parse-Fehler' }
    }
  }, [content])

  // SVG-ViewBox an Content-Hoehe anpassen
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const update = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w > 0 && h > 0) setViewBoxHeight(getViewBoxHeight(w, h))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [parsed, fontSize])

  // --- Pointer-Handling fuer Annotationen ---
  const getPointerData = useCallback(
    (e: React.PointerEvent) => {
      const svg = svgRef.current
      if (!svg) return null
      const rect = svg.getBoundingClientRect()
      const pressure = e.pressure > 0 ? e.pressure : 0.5
      return toNormalized(e.clientX, e.clientY, pressure, rect, viewBoxHeight)
    },
    [viewBoxHeight],
  )

  const findStrokeAtPoint = useCallback(
    (point: number[]): string | null => {
      const [px, py] = point
      const threshold = 20
      for (let i = strokes.length - 1; i >= 0; i--) {
        const s = strokes[i]
        for (const [sx, sy] of s.points) {
          const dist = Math.sqrt((px - sx) ** 2 + (py - sy) ** 2)
          if (dist < threshold + s.width) return s.id
        }
      }
      return null
    },
    [strokes],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!drawingMode || e.button !== 0) return
      activePointersRef.current.add(e.pointerId)
      if (activePointersRef.current.size >= 2) {
        wasPinchRef.current = true
        if (activeStroke) setActiveStroke(null)
        for (const id of activePointersRef.current) {
          if (id !== e.pointerId) {
            try { (e.currentTarget as Element).releasePointerCapture(id) } catch { /* no-op */ }
          }
        }
        return
      }
      if (wasPinchRef.current) return
      const point = getPointerData(e)
      if (!point) return
      e.currentTarget.setPointerCapture(e.pointerId)
      if (tool === 'eraser') {
        const id = findStrokeAtPoint(point)
        if (id) eraseStroke(key, id)
        return
      }
      if (tool === 'move') {
        // Move-Tool wird auf dem Companion-PDF (AnnotatedPage) genutzt —
        // im Endlos-Fallback hier ignorieren wir den Mode.
        return
      }
      // Zeile unter dem Cursor finden und merken — wird im PointerUp zum
      // semantischen Anker des Strokes. elementsFromPoint (Plural) liefert
      // alle Elemente am Punkt in z-Order; das oberste ist das Annotations-
      // SVG (pointer-events: auto im Zeichenmodus), die Paragraph-Linie
      // liegt darunter.
      const elsAtPoint = document.elementsFromPoint(e.clientX, e.clientY)
      let lineEl: HTMLElement | null = null
      for (const el of elsAtPoint) {
        if (!(el instanceof HTMLElement)) continue
        const found = el.closest('[data-line-key]') as HTMLElement | null
        if (found) { lineEl = found; break }
      }
      const lineKey = lineEl?.dataset.lineKey
      drawAnchorRef.current = lineEl && lineKey
        ? { lineKey, lineRect: lineEl.getBoundingClientRect() }
        : null
      const newStroke: Stroke = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        points: [point],
        color: tool === 'highlighter' ? color + '80' : color,
        width: tool === 'highlighter' ? strokeWidth * 3 : strokeWidth,
        tool,
      }
      setActiveStroke(newStroke)
    },
    [drawingMode, tool, color, strokeWidth, activeStroke, getPointerData, setActiveStroke, findStrokeAtPoint, eraseStroke, key],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawingMode) return
      if (activePointersRef.current.size >= 2 || wasPinchRef.current) return
      const point = getPointerData(e)
      if (!point) return
      if (tool === 'eraser') {
        const id = findStrokeAtPoint(point)
        if (id) eraseStroke(key, id)
        return
      }
      if (!activeStroke) return
      setActiveStroke({ ...activeStroke, points: [...activeStroke.points, point] })
    },
    [drawingMode, tool, activeStroke, getPointerData, setActiveStroke, findStrokeAtPoint, eraseStroke, key],
  )

  const handlePointerUp = useCallback(() => {
    activePointersRef.current.clear()
    if (activePointersRef.current.size === 0) wasPinchRef.current = false
    if (!drawingMode || !activeStroke) return

    // Anker berechnen: Stroke-Bounding-Box in viewBox -> px im aktuellen
    // SVG -> px relativ zur beim PointerDown gemerkten Zeile.
    let anchor: StrokeAnchor | undefined
    const draw = drawAnchorRef.current
    const svg = svgRef.current
    if (draw && svg && activeStroke.points.length >= 2) {
      const svgRect = svg.getBoundingClientRect()
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const p of activeStroke.points) {
        if (p[0] < minX) minX = p[0]
        if (p[0] > maxX) maxX = p[0]
        if (p[1] < minY) minY = p[1]
        if (p[1] > maxY) maxY = p[1]
      }
      const pxPerVbX = svgRect.width / VIEWBOX_WIDTH
      const pxPerVbY = svgRect.height / viewBoxHeight
      // bbox in Doc-Koordinaten (relativ zum Viewport)
      const docLeft = svgRect.left + minX * pxPerVbX
      const docTop = svgRect.top + minY * pxPerVbY
      anchor = {
        lineKey: draw.lineKey,
        bboxLeftPx: docLeft - draw.lineRect.left,
        bboxTopPx: docTop - draw.lineRect.top,
        bboxWidthPx: (maxX - minX) * pxPerVbX,
        bboxHeightPx: (maxY - minY) * pxPerVbY,
        lineWidthPx: draw.lineRect.width,
      }
    }
    drawAnchorRef.current = null
    commitStroke(key, anchor)
  }, [drawingMode, activeStroke, key, commitStroke, viewBoxHeight])

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId)
    if (activePointersRef.current.size === 0) wasPinchRef.current = false
  }, [])

  const renderStroke = (stroke: Stroke) => {
    const d = getSvgPathFromStroke(stroke.points, stroke.width, stroke.tool)
    if (!d) return null
    return <path key={stroke.id} d={d} fill={stroke.color} />
  }

  const activeD = activeStroke
    ? getSvgPathFromStroke(activeStroke.points, activeStroke.width, activeStroke.tool)
    : null

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

  return (
    <div className="text-viewer">
      <div
        className="rtf-viewer-content"
        style={{ fontSize }}
        ref={(el) => {
          if (scrollContainerRef) {
            (scrollContainerRef as React.MutableRefObject<HTMLElement | null>).current = el
          }
        }}
      >
        <div className="rtf-viewer-inner" ref={contentRef}>
          {parsed.paragraphs.flatMap(renderParagraph)}
          <svg
            ref={svgRef}
            className={`annotation-svg${drawingMode ? ' annotation-svg--active' : ''}`}
            viewBox={`0 0 ${VIEWBOX_WIDTH} ${viewBoxHeight}`}
            preserveAspectRatio="none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {strokes.map(renderStroke)}
            {activeD && <path d={activeD} fill={activeStroke!.color} />}
          </svg>
        </div>
      </div>
    </div>
  )
}
