import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useAnnotationStore } from '@/hooks/useAnnotations.ts'
import { toNormalized, getSvgPathFromStroke, getViewBoxHeight } from '@/utils/strokeUtils.ts'
import type { Stroke } from '@/types/index.ts'

interface AnnotatedPageProps {
  page: number
  src: string
  alt: string
  scale: number
  loading?: 'eager' | 'lazy'
  docId: number
}

function getScrollParent(el: Element | null): Element | Window {
  let cur = el?.parentElement ?? null
  while (cur) {
    const s = window.getComputedStyle(cur)
    if (/(auto|scroll)/.test(s.overflowY) || /(auto|scroll)/.test(s.overflowX)) return cur
    cur = cur.parentElement
  }
  return window
}

function pointerCentroid(positions: Map<number, { x: number; y: number }>): { x: number; y: number } | null {
  let sx = 0, sy = 0, n = 0
  for (const p of positions.values()) { sx += p.x; sy += p.y; n++ }
  return n > 0 ? { x: sx / n, y: sy / n } : null
}

export function AnnotatedPage({ page, src, alt, scale, loading, docId }: AnnotatedPageProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const activePointersRef = useRef<Set<number>>(new Set())
  const wasPinchRef = useRef(false)
  const pointerPositionsRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  const panningRef = useRef(false)
  const panLastRef = useRef<{ x: number; y: number } | null>(null)
  const scrollParentRef = useRef<Element | Window | null>(null)
  const hasStylusBeenUsedRef = useRef(false)
  const [viewBoxHeight, setViewBoxHeight] = useState(1414) // A4 default
  const [imgLoaded, setImgLoaded] = useState(false)

  const drawingMode = useAnnotationStore((s) => s.drawingMode)
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const activeStroke = useAnnotationStore((s) => s.activeStroke)
  const key = `${docId}::${page}`
  const rawStrokes = useAnnotationStore((s) => s.pages[key])
  const strokes = useMemo(() => rawStrokes || [], [rawStrokes])

  const loadPage = useAnnotationStore((s) => s.loadPage)
  const setActiveStroke = useAnnotationStore((s) => s.setActiveStroke)
  const commitStroke = useAnnotationStore((s) => s.commitStroke)
  const eraseStroke = useAnnotationStore((s) => s.eraseStroke)
  const moveStrokeAction = useAnnotationStore((s) => s.moveStroke)
  const duplicateStrokeAction = useAnnotationStore((s) => s.duplicateStroke)

  const DUPLICATE_OFFSET = 30

  // Move-Mode-State: ausgewaehlter Stroke + Drag-Delta in viewBox-Koordinaten
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dragRef = useRef<{
    strokeId: string
    startVbX: number
    startVbY: number
  } | null>(null)
  const [dragDelta, setDragDelta] = useState<{ x: number; y: number } | null>(null)

  // Beim Tool-Wechsel weg vom Move-Tool die Auswahl loesen
  useEffect(() => {
    if (tool !== 'move') {
      setSelectedId(null)
      dragRef.current = null
      setDragDelta(null)
    }
  }, [tool])

  // Stylus-Detection nur fuer die Dauer einer Annotations-Session merken,
  // damit Finger-Zeichnen nach Aus-/Einschalten wieder moeglich ist.
  useEffect(() => {
    if (!drawingMode) hasStylusBeenUsedRef.current = false
  }, [drawingMode])

  // Load annotations when component mounts
  useEffect(() => {
    loadPage(docId, page)
  }, [docId, page, loadPage])

  // Update viewBox when image loads
  const handleImgLoad = useCallback(() => {
    const img = imgRef.current
    if (img && img.naturalWidth > 0) {
      setViewBoxHeight(getViewBoxHeight(img.naturalWidth, img.naturalHeight))
      setImgLoaded(true)
    }
  }, [])

  // Handle cached images where onLoad may have already fired
  useEffect(() => {
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0 && !imgLoaded) {
      handleImgLoad()
    }
  }, [handleImgLoad, imgLoaded])

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
      pointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (e.pointerType === 'pen') hasStylusBeenUsedRef.current = true

      const fingerCount = activePointersRef.current.size
      const isFinger = e.pointerType === 'touch'

      // Stylus-Detection: Sobald ein Pencil im Spiel war, scrollt der Finger
      // (Apple-Notes-/Procreate-Konvention)
      if (isFinger && hasStylusBeenUsedRef.current && fingerCount === 1) {
        panningRef.current = true
        if (activeStroke) setActiveStroke(null)
        panLastRef.current = { x: e.clientX, y: e.clientY }
        if (!scrollParentRef.current) scrollParentRef.current = getScrollParent(svgRef.current)
        return
      }

      // 3+ Finger = Pan-Geste
      if (fingerCount >= 3) {
        panningRef.current = true
        wasPinchRef.current = false
        if (activeStroke) setActiveStroke(null)
        for (const id of activePointersRef.current) {
          try { (e.currentTarget as Element).releasePointerCapture(id) } catch { /* no-op */ }
        }
        panLastRef.current = pointerCentroid(pointerPositionsRef.current) ?? { x: e.clientX, y: e.clientY }
        if (!scrollParentRef.current) scrollParentRef.current = getScrollParent(svgRef.current)
        return
      }

      // 2 Finger = Pinch-Geste, kein Zeichnen. Falls vorher Pan lief: beenden.
      if (fingerCount >= 2) {
        wasPinchRef.current = true
        panningRef.current = false
        panLastRef.current = null
        if (activeStroke) setActiveStroke(null)
        for (const id of activePointersRef.current) {
          if (id !== e.pointerId) {
            try { (e.currentTarget as Element).releasePointerCapture(id) } catch { /* no-op */ }
          }
        }
        return
      }
      // Nach Pinch: Restfinger soll nicht mehr zeichnen
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
        const id = findStrokeAtPoint(point)
        if (id) {
          setSelectedId(id)
          dragRef.current = { strokeId: id, startVbX: point[0], startVbY: point[1] }
          setDragDelta({ x: 0, y: 0 })
        } else {
          setSelectedId(null)
          dragRef.current = null
          setDragDelta(null)
        }
        return
      }

      if (tool === 'duplicate') {
        const id = findStrokeAtPoint(point)
        if (!id) return
        const newId = duplicateStrokeAction(key, id, DUPLICATE_OFFSET, DUPLICATE_OFFSET)
        if (newId) {
          setSelectedId(newId)
          window.setTimeout(() => {
            setSelectedId((current) => (current === newId ? null : current))
          }, 600)
        }
        return
      }

      const newStroke: Stroke = {
        id: Math.random().toString(36).slice(2) + Date.now().toString(36),
        points: [point],
        color: color + '99',
        width: tool === 'highlighter' ? strokeWidth * 3 : strokeWidth,
        tool,
      }
      setActiveStroke(newStroke)
    },
    [drawingMode, tool, color, strokeWidth, activeStroke, getPointerData, setActiveStroke, findStrokeAtPoint, eraseStroke, duplicateStrokeAction, key],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawingMode) return
      pointerPositionsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      if (panningRef.current && panLastRef.current && scrollParentRef.current) {
        const fingerCount = activePointersRef.current.size
        const cur = fingerCount >= 3
          ? pointerCentroid(pointerPositionsRef.current)
          : { x: e.clientX, y: e.clientY }
        if (cur) {
          const dx = cur.x - panLastRef.current.x
          const dy = cur.y - panLastRef.current.y
          const sp = scrollParentRef.current
          if (sp === window) window.scrollBy(-dx, -dy)
          else (sp as Element).scrollBy(-dx, -dy)
          panLastRef.current = cur
        }
        return
      }

      if (activePointersRef.current.size >= 2 || wasPinchRef.current) return
      const point = getPointerData(e)
      if (!point) return

      if (tool === 'eraser') {
        const id = findStrokeAtPoint(point)
        if (id) eraseStroke(key, id)
        return
      }

      if (tool === 'move') {
        if (!dragRef.current) return
        setDragDelta({
          x: point[0] - dragRef.current.startVbX,
          y: point[1] - dragRef.current.startVbY,
        })
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

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId)
    pointerPositionsRef.current.delete(e.pointerId)
    if (activePointersRef.current.size === 0) {
      wasPinchRef.current = false
      panningRef.current = false
      panLastRef.current = null
      scrollParentRef.current = null
    }
    if (!drawingMode) return
    if (panningRef.current) return

    if (tool === 'move') {
      if (dragRef.current && dragDelta && (Math.abs(dragDelta.x) > 0.5 || Math.abs(dragDelta.y) > 0.5)) {
        moveStrokeAction(key, dragRef.current.strokeId, dragDelta.x, dragDelta.y)
      }
      dragRef.current = null
      setDragDelta(null)
      return
    }

    if (!activeStroke) return
    commitStroke(key)
  }, [drawingMode, tool, activeStroke, key, commitStroke, dragDelta, moveStrokeAction])

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId)
    pointerPositionsRef.current.delete(e.pointerId)
    if (activePointersRef.current.size === 0) {
      wasPinchRef.current = false
      panningRef.current = false
      panLastRef.current = null
      scrollParentRef.current = null
    }
    if (tool === 'move') {
      dragRef.current = null
      setDragDelta(null)
    }
  }, [tool])

  // Bounding-Box des selektierten Strokes fuer Selection-Halo
  const selectedBbox = useMemo(() => {
    if (!selectedId) return null
    const s = strokes.find((x) => x.id === selectedId)
    if (!s || s.points.length === 0) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const [x, y] of s.points) {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    const pad = (s.width || 4) * 1.5 + 6
    return {
      x: minX - pad,
      y: minY - pad,
      w: (maxX - minX) + 2 * pad,
      h: (maxY - minY) + 2 * pad,
    }
  }, [selectedId, strokes])

  const renderStroke = (stroke: Stroke) => {
    const d = getSvgPathFromStroke(stroke.points, stroke.width, stroke.tool)
    if (!d) return null
    const isDragging = dragRef.current?.strokeId === stroke.id && dragDelta
    const transform = isDragging ? `translate(${dragDelta!.x} ${dragDelta!.y})` : undefined
    return (
      <path
        key={stroke.id}
        d={d}
        fill={stroke.color}
        transform={transform}
      />
    )
  }

  const activeD = activeStroke
    ? getSvgPathFromStroke(activeStroke.points, activeStroke.width, activeStroke.tool)
    : null

  return (
    <div className="annotated-page" style={{ width: `${scale * 100}%` }}>
      <img
        ref={imgRef}
        className="pdf-page-img"
        src={src}
        alt={alt}
        loading={loading}
        draggable={false}
        onLoad={handleImgLoad}
      />
      {imgLoaded && (
        <svg
          ref={svgRef}
          className={`annotation-svg${drawingMode ? ' annotation-svg--active' : ''}${tool === 'move' ? ' annotation-svg--move' : ''}${tool === 'duplicate' ? ' annotation-svg--duplicate' : ''}`}
          viewBox={`0 0 1000 ${viewBoxHeight}`}
          preserveAspectRatio="none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          {strokes.map(renderStroke)}
          {activeD && <path d={activeD} fill={activeStroke!.color} />}
          {selectedBbox && (
            <rect
              x={selectedBbox.x}
              y={selectedBbox.y}
              width={selectedBbox.w}
              height={selectedBbox.h}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
              transform={dragRef.current && dragDelta ? `translate(${dragDelta.x} ${dragDelta.y})` : undefined}
              pointerEvents="none"
            />
          )}
        </svg>
      )}
    </div>
  )
}
