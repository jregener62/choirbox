import { useCallback, useState, useEffect, useMemo, useRef } from 'react'
import { api } from '@/api/client.ts'
import { parseRtf } from '@/utils/rtfParser'
import { renderParagraph } from '@/utils/rtfRender'
import { useAnnotationStore } from '@/hooks/useAnnotations.ts'
import { toNormalized, getSvgPathFromStroke, getViewBoxHeight } from '@/utils/strokeUtils.ts'
import type { Stroke } from '@/types/index.ts'

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
    commitStroke(key)
  }, [drawingMode, activeStroke, key, commitStroke])

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
