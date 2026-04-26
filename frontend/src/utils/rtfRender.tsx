import type { CSSProperties, ReactNode } from 'react'
import {
  detectSectionHeading,
  splitInlineMarkers,
  isCommentOnlyLine,
  splitMelodyChars,
} from '@/utils/markers'
import type { RtfFormat, RtfParagraph, RtfRun } from '@/utils/rtfParser'

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

function renderTextWithMelody(text: string, keyPrefix: string): ReactNode[] {
  return splitMelodyChars(text).map((seg, i) => {
    const key = `${keyPrefix}-m${i}`
    if (seg.kind === 'melody') {
      return <span key={key} className="rtf-viewer-melody-glyph">{seg.text}</span>
    }
    return <span key={key}>{seg.text}</span>
  })
}

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

function renderLineRuns(runs: RtfRun[], keyPrefix: string): ReactNode[] {
  return runs.flatMap((run, i) => {
    const rendered = renderRun(run, `${keyPrefix}-${i}`)
    return Array.isArray(rendered) ? rendered : [rendered]
  })
}

function renderVirtualLineNode(runs: RtfRun[], key: string): { isFooter: boolean; node: ReactNode } {
  // data-line-key auf der aeussersten DOM-Node — wird vom Annotations-System
  // benutzt, um Strokes semantisch an die Zeile zu binden (siehe useAnnotations
  // / RtfPagedView). Der Wert ist immer derselbe wie der React-key.
  if (runs.length === 0) {
    return {
      isFooter: false,
      node: <p key={key} data-line-key={key} className="rtf-viewer-para rtf-viewer-para--empty">&nbsp;</p>,
    }
  }
  const text = runsText(runs)
  const heading = detectSectionHeading(text)
  if (heading) {
    const level = Math.min(Math.max(heading.level, 1), 6)
    const className = `rtf-viewer-heading rtf-viewer-heading--l${level}`
    const isFooter = level === 6
    let node: ReactNode
    switch (level) {
      case 1: node = <h1 key={key} data-line-key={key} className={className}>{heading.title}</h1>; break
      case 2: node = <h2 key={key} data-line-key={key} className={className}>{heading.title}</h2>; break
      case 3: node = <h3 key={key} data-line-key={key} className={className}>{heading.title}</h3>; break
      case 4: node = <h4 key={key} data-line-key={key} className={className}>{heading.title}</h4>; break
      case 5: node = <h5 key={key} data-line-key={key} className={className}>{heading.title}</h5>; break
      default: node = <h6 key={key} data-line-key={key} className={className}>{heading.title}</h6>
    }
    return { isFooter, node }
  }
  if (isCommentOnlyLine(text)) {
    const inner = text.trim().replace(/^\[\[\s*|\s*\]\]$/g, '')
    return {
      isFooter: false,
      node: (
        <p key={key} data-line-key={key} className="rtf-viewer-para rtf-viewer-comment-block">
          {renderTextWithMelody(inner, `${key}-block`)}
        </p>
      ),
    }
  }
  return {
    isFooter: false,
    node: (
      <p key={key} data-line-key={key} className="rtf-viewer-para">
        {renderLineRuns(runs, key)}
      </p>
    ),
  }
}

export interface VirtualLine {
  key: string
  isFooter: boolean
  isPageBreak: boolean
  node: ReactNode
}

/** Flacht alle Paragraphen zu virtuellen Zeilen. Jede Zeile bekommt einen
 *  isFooter-Flag (level-6-Heading) — der Paged-Viewer trennt diese ab und
 *  rendert sie unten auf jeder Seite. Manuelle Seitenumbrueche (rtfParser
 *  pageBreak: true) werden als unsichtbarer Marker mit isPageBreak: true
 *  emittiert. */
export function paragraphsToVirtualLines(paragraphs: RtfParagraph[]): VirtualLine[] {
  const out: VirtualLine[] = []
  paragraphs.forEach((p, idx) => {
    if (p.pageBreak) {
      const key = `${idx}-pb`
      out.push({
        key,
        isFooter: false,
        isPageBreak: true,
        node: <div key={key} className="rtf-viewer-page-break" data-page-break="" aria-hidden="true" />,
      })
      return
    }
    if (p.runs.length === 0) {
      const key = `${idx}-empty`
      out.push({
        key,
        isFooter: false,
        isPageBreak: false,
        node: <p key={key} className="rtf-viewer-para rtf-viewer-para--empty">&nbsp;</p>,
      })
      return
    }
    splitParagraphIntoLines(p).forEach((runs, li) => {
      const key = `${idx}-${li}`
      const { isFooter, node } = renderVirtualLineNode(runs, key)
      out.push({ key, isFooter, isPageBreak: false, node })
    })
  })
  return out
}

/** Rendering-Helfer fuer den klassischen Endlos-Viewer — eine Liste
 *  React-Knoten pro Paragraph (eine pro virtueller Zeile). */
export function renderParagraph(p: RtfParagraph, idx: number): ReactNode[] {
  if (p.pageBreak) {
    return [<hr key={`${idx}-pb`} className="rtf-viewer-page-break" aria-label="Seitenumbruch" />]
  }
  if (p.runs.length === 0) {
    return [<p key={idx} className="rtf-viewer-para rtf-viewer-para--empty">&nbsp;</p>]
  }
  return splitParagraphIntoLines(p).map((runs, i) => {
    const key = `${idx}-${i}`
    return renderVirtualLineNode(runs, key).node
  })
}
