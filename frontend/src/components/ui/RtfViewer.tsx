import { useState, useEffect, useMemo } from 'react'
import type { CSSProperties } from 'react'
import { api } from '@/api/client.ts'
import { parseRtf, type RtfFormat, type RtfParagraph, type RtfRun } from '@/utils/rtfParser'
import {
  detectSectionHeading,
  splitInlineMarkers,
  isCommentOnlyLine,
} from '@/utils/markers'

interface RtfViewerProps {
  docId: number
  originalName: string
  fontSize?: number
  showName?: boolean
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

/** Rendert einen Run und wendet inline Marker-Erkennung an: `[[ ... ]]` als
 *  Kommentar-Span, `|<ws>X` als bar-initial (erstes sichtbares Zeichen des
 *  Taktes mit Unterstrich). Lauftext behaelt die Run-Formatierung. */
function renderRun(run: RtfRun, keyPrefix: string) {
  const spans = splitInlineMarkers(run.text)
  if (spans.length === 1 && spans[0].kind === 'text') {
    return <span key={keyPrefix} style={runStyle(run.format)}>{run.text}</span>
  }
  return spans.map((span, i) => {
    const key = `${keyPrefix}-${i}`
    if (span.kind === 'comment') {
      return <span key={key} className="rtf-viewer-comment">{span.text}</span>
    }
    if (span.kind === 'bar-initial') {
      return (
        <span key={key} className="rtf-viewer-bar-initial" style={runStyle(run.format)}>
          {span.text}
        </span>
      )
    }
    return <span key={key} style={runStyle(run.format)}>{span.text}</span>
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
    return <p key={key} className="rtf-viewer-para rtf-viewer-comment-block">{inner}</p>
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
  originalName,
  fontSize = 16,
  showName = true,
  scrollContainerRef,
}: RtfViewerProps) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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
      {showName && <div className="text-viewer-name">{originalName}</div>}
      <div
        className="rtf-viewer-content"
        style={{ fontSize }}
        ref={(el) => {
          if (scrollContainerRef) {
            (scrollContainerRef as React.MutableRefObject<HTMLElement | null>).current = el
          }
        }}
      >
        {parsed.paragraphs.flatMap(renderParagraph)}
      </div>
    </div>
  )
}
