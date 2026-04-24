import { useCallback, useState, useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { api } from '@/api/client.ts'
import { parseRtf, type RtfFormat, type RtfParagraph, type RtfRun } from '@/utils/rtfParser'
import {
  detectSectionHeading,
  splitInlineMarkers,
  isCommentOnlyLine,
  splitMelodyChars,
} from '@/utils/markers'
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

function runStyle(f: RtfFormat): CSSProperties {
  const s: CSSProperties = {}
  if (f.b) s.fontWeight = 700
  if (f.i) s.fontStyle = 'italic'
  const decos: string[] = []
  if (f.u) decos.push('underline')
  if (f.s) decos.push('line-through')
  if (decos.length > 0) s.textDecoration = decos.join(' ')
  if (f.color) s.color = f.color
  if (f.bg) s.backgroundColor = f.bg
  if (f.fontSize) s.fontSize = `${f.fontSize / 12}em`
  return s
}

/** Rendert einen Text-String mit Melodie-Glyphen: Noten-Zeichen (`/`,`\\`,`_`,
 *  `~` und Unicode-Pfeile) bekommen die rote `rtf-viewer-melody-glyph`-Klasse,
 *  der Rest faellt in den umgebenden Run-Style. */
function renderTextWithMelody(text: string, keyPrefix: string): React.ReactNode[] {
  return splitMelodyChars(text).map((seg, i) => {
    const key = `${keyPrefix}-m${i}`
    if (seg.kind === 'melody') {
      return <span key={key} className="rtf-viewer-melody-glyph">{seg.text}</span>
    }
    return <span key={key}>{seg.text}</span>
  })
}

/** Rendert einen Run und wendet inline Marker-Erkennung an: `[[ ... ]]` als
 *  Kommentar-Span, `|<ws>X` als bar-initial (erstes sichtbares Zeichen des
 *  Taktes mit Unterstrich). Lauftext behaelt die Run-Formatierung. */
function renderRun(run: RtfRun, keyPrefix: string) {
  const spans = splitInlineMarkers(run.text)
  if (spans.length === 1 && spans[0].kind === 'text') {
    return (
      <span key={keyPrefix} style={runStyle(run.format)}>
        {renderTextWithMelody(run.text, keyPrefix)}
      </span>
    )
  }
  return spans.map((span, i) => {
    const key = `${keyPrefix}-${i}`
    if (span.kind === 'comment') {
      return (
        <span key={key} className="rtf-viewer-comment">
          {renderTextWithMelody(span.text, key)}
        </span>
      )
    }
    if (span.kind === 'bar-initial') {
      return (
        <span key={key} className="rtf-viewer-bar-initial" style={runStyle(run.format)}>
          {renderTextWithMelody(span.text, key)}
        </span>
      )
    }
    return (
      <span key={key} style={runStyle(run.format)}>
        {renderTextWithMelody(span.text, key)}
      </span>
    )
  })
}

/**
 * Splittet einen Paragraph an internen `\n` (aus `\line`-Soft-Breaks) in
 * "virtuelle Zeilen". Jede virtuelle Zeile bekommt ihre eigenen Runs mit
 * preservierter Formatierung. So kann Marker-Erkennung (Heading, Bar-Lead,
 * Kommentar) pro Zeile statt pro Paragraph laufen — wichtig fuer RTF aus
 * externen Editoren, die nicht immer `\par` zwischen Abschnitten setzen.
 */
function splitParagraphIntoLines(p: RtfParagraph): RtfRun[][] {
  const lines: RtfRun[][] = [[]]
  for (const run of p.runs) {
    if (!run.text.includes('\n')) {
      lines[lines.length - 1].push(run)
      continue
    }
    const parts = run.text.split('\n')
    if (parts[0] !== '') lines[lines.length - 1].push({ text: parts[0], format: run.format })
    for (let i = 1; i < parts.length; i++) {
      lines.push([])
      if (parts[i] !== '') lines[lines.length - 1].push({ text: parts[i], format: run.format })
    }
  }
  return lines
}

function runsText(runs: RtfRun[]): string {
  return runs.map((r) => r.text).join('')
}

function renderLineRuns(runs: RtfRun[], keyPrefix: string): React.ReactNode[] {
  return runs.flatMap((run, i) => {
    const rendered = renderRun(run, `${keyPrefix}-${i}`)
    return Array.isArray(rendered) ? rendered : [rendered]
  })
}


function renderVirtualLine(runs: RtfRun[], key: string): React.ReactNode {
  if (runs.length === 0) {
    return <p key={key} className="rtf-viewer-para rtf-viewer-para--empty">&nbsp;</p>
  }

  const text = runsText(runs)

  const heading = detectSectionHeading(text)
  if (heading) {
    const level = Math.min(Math.max(heading.level, 1), 6)
    const className = `rtf-viewer-heading rtf-viewer-heading--l${level}`
    switch (level) {
      case 1: return <h1 key={key} className={className}>{heading.title}</h1>
      case 2: return <h2 key={key} className={className}>{heading.title}</h2>
      case 3: return <h3 key={key} className={className}>{heading.title}</h3>
      case 4: return <h4 key={key} className={className}>{heading.title}</h4>
      case 5: return <h5 key={key} className={className}>{heading.title}</h5>
      default: return <h6 key={key} className={className}>{heading.title}</h6>
    }
  }

  if (isCommentOnlyLine(text)) {
    const inner = text.trim().replace(/^\[\[\s*|\s*\]\]$/g, '')
    return (
      <p key={key} className="rtf-viewer-para rtf-viewer-comment-block">
        {renderTextWithMelody(inner, `${key}-block`)}
      </p>
    )
  }

  return (
    <p key={key} className="rtf-viewer-para">
      {renderLineRuns(runs, key)}
    </p>
  )
}

function renderParagraph(p: RtfParagraph, idx: number): React.ReactNode[] {
  if (p.runs.length === 0) {
    return [<p key={idx} className="rtf-viewer-para rtf-viewer-para--empty">&nbsp;</p>]
  }
  const lines = splitParagraphIntoLines(p)
  return lines.map((runs, i) => renderVirtualLine(runs, `${idx}-${i}`))
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
