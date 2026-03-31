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
  dropboxPath: string
}

export function AnnotatedPage({ page, src, alt, scale, loading, dropboxPath }: AnnotatedPageProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [viewBoxHeight, setViewBoxHeight] = useState(1414) // A4 default
  const [imgLoaded, setImgLoaded] = useState(false)

  const drawingMode = useAnnotationStore((s) => s.drawingMode)
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const activeStroke = useAnnotationStore((s) => s.activeStroke)
  const key = `${dropboxPath}::${page}`
  const rawStrokes = useAnnotationStore((s) => s.pages[key])
  const strokes = useMemo(() => rawStrokes || [], [rawStrokes])

  const loadPage = useAnnotationStore((s) => s.loadPage)
  const setActiveStroke = useAnnotationStore((s) => s.setActiveStroke)
  const commitStroke = useAnnotationStore((s) => s.commitStroke)
  const eraseStroke = useAnnotationStore((s) => s.eraseStroke)

  // Load annotations when component mounts
  useEffect(() => {
    loadPage(dropboxPath, page)
  }, [dropboxPath, page, loadPage])

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!drawingMode || e.button !== 0) return

      if (tool === 'eraser') return // eraser works on pointerDown on existing strokes

      const point = getPointerData(e)
      if (!point) return

      e.currentTarget.setPointerCapture(e.pointerId)
      const newStroke: Stroke = {
        id: crypto.randomUUID(),
        points: [point],
        color: tool === 'highlighter' ? color + '80' : color,
        width: tool === 'highlighter' ? strokeWidth * 3 : strokeWidth,
        tool,
      }
      setActiveStroke(newStroke)
    },
    [drawingMode, tool, color, strokeWidth, getPointerData, setActiveStroke],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!drawingMode || !activeStroke) return
      const point = getPointerData(e)
      if (!point) return

      setActiveStroke({
        ...activeStroke,
        points: [...activeStroke.points, point],
      })
    },
    [drawingMode, activeStroke, getPointerData, setActiveStroke],
  )

  const handlePointerUp = useCallback(() => {
    if (!drawingMode || !activeStroke) return
    commitStroke(key)
  }, [drawingMode, activeStroke, key, commitStroke])

  const handleEraseClick = useCallback(
    (strokeId: string) => {
      if (!drawingMode || tool !== 'eraser') return
      eraseStroke(key, strokeId)
    },
    [drawingMode, tool, key, eraseStroke],
  )

  const renderStroke = (stroke: Stroke) => {
    const d = getSvgPathFromStroke(stroke.points, stroke.width, stroke.tool)
    if (!d) return null
    return (
      <path
        key={stroke.id}
        d={d}
        fill={stroke.color}
        onClick={() => handleEraseClick(stroke.id)}
        style={tool === 'eraser' && drawingMode ? { cursor: 'pointer' } : undefined}
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
          className={`annotation-svg${drawingMode ? ' annotation-svg--active' : ''}`}
          viewBox={`0 0 1000 ${viewBoxHeight}`}
          preserveAspectRatio="none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {strokes.map(renderStroke)}
          {activeD && <path d={activeD} fill={activeStroke!.color} />}
        </svg>
      )}
    </div>
  )
}
