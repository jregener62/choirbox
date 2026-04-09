import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/api/client.ts'
import { parseChordSheet } from '@/utils/chordPro'
import { ChordSheetViewer } from '@/components/ui/ChordSheetViewer'
import { useAnnotationStore } from '@/hooks/useAnnotations.ts'
import { toNormalized, getSvgPathFromStroke, getViewBoxHeight } from '@/utils/strokeUtils.ts'
import type { Stroke } from '@/types/index.ts'
import './ChordSheetTextViewer.css'

interface ChordSheetTextViewerProps {
  docId: number
  originalName: string
  transposition: number
  fontSize?: number
  showName?: boolean
  scrollContainerRef?: React.RefObject<HTMLElement | null>
}

const ANNOTATION_PAGE = 1
const VIEWBOX_WIDTH = 1000

export function ChordSheetTextViewer({
  docId,
  originalName,
  transposition,
  fontSize = 14,
  showName = true,
  scrollContainerRef,
}: ChordSheetTextViewerProps) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
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

  // Load text content
  useEffect(() => {
    let cancelled = false
    setText(null)
    setError(null)
    async function fetchContent() {
      try {
        const data = await api<{ content: string }>(`/documents/${docId}/content`)
        if (!cancelled) setText(data.content)
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Chord Sheet konnte nicht geladen werden')
      }
    }
    fetchContent()
    return () => {
      cancelled = true
    }
  }, [docId])

  // Load saved annotations for this document
  useEffect(() => {
    loadPage(docId, ANNOTATION_PAGE)
  }, [docId, loadPage])

  // Track content height so the SVG viewBox stays in sync with the rendered content
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const update = () => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (w > 0 && h > 0) {
        setViewBoxHeight(getViewBoxHeight(w, h))
      }
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, fontSize, transposition])

  const parsed = useMemo(() => (text ? parseChordSheet(text) : null), [text])

  // --- Pointer handling for annotations ---
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
      setActiveStroke({
        ...activeStroke,
        points: [...activeStroke.points, point],
      })
    },
    [drawingMode, tool, activeStroke, getPointerData, setActiveStroke, findStrokeAtPoint, eraseStroke, key],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      activePointersRef.current.delete(e.pointerId)
      if (activePointersRef.current.size === 0) wasPinchRef.current = false
      if (!drawingMode || !activeStroke) return
      commitStroke(key)
    },
    [drawingMode, activeStroke, key, commitStroke],
  )

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
        <div className="pdf-upload-text" style={{ color: 'var(--danger)' }}>
          {error}
        </div>
      </div>
    )
  }

  if (!parsed) {
    return (
      <div className="pdf-upload">
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Chord Sheet laden...</span>
      </div>
    )
  }

  return (
    <div
      className="cho-viewer-wrap"
      style={{ fontSize }}
      ref={(el) => {
        if (scrollContainerRef) {
          (scrollContainerRef as React.MutableRefObject<HTMLElement | null>).current = el
        }
      }}
    >
      <div className="cho-viewer-content" ref={contentRef}>
        {showName && <div className="cho-viewer-name">{originalName}</div>}
        <ChordSheetViewer content={parsed} transposition={transposition} />
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
  )
}
