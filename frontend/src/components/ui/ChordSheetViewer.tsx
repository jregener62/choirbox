import { useMemo, type ReactNode } from 'react'
import { transposeChord, shouldUseFlats } from '@/utils/chordTransposer'
import { getVocalMeta } from '@/utils/vocalValidation'
import type { ChordLine, ChordLineFormat, ChordSheetMetadata, ParsedChordContent, VocalMarkPosition } from '@/types/index'
import './ChordSheetViewer.css'

interface ChordSheetViewerProps {
  content: ParsedChordContent
  transposition: number
  /** Wenn true: Akkord-Zeilen komplett ausblenden (reiner Text-Modus).
   *  Metadata, Section-Labels und Kommentare bleiben sichtbar. */
  hideChords?: boolean
  /** Wenn true: Gesangsanweisungen (breath, fermata, dynamics, ...) ausblenden. */
  hideVocal?: boolean
}

export function ChordSheetViewer({ content, transposition, hideChords = false, hideVocal = false }: ChordSheetViewerProps) {
  const flats = useMemo(
    () => shouldUseFlats(content.all_chords || []),
    [content.all_chords],
  )

  return (
    <div className="chord-sheet-viewer">
      {content.metadata && <MetadataHeader meta={content.metadata} />}
      {content.sections.map((section, si) => (
        <div key={si} className={`chord-section chord-section-${section.type}`}>
          {section.label && (
            <div className={`chord-section-label chord-section-label-${section.type}`}>
              {section.label}
            </div>
          )}
          {section.lines.map((line, li) => (
            <ChordLineView
              key={li}
              line={line}
              transposition={transposition}
              flats={flats}
              hideChords={hideChords}
              hideVocal={hideVocal}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function MetadataHeader({ meta }: { meta: ChordSheetMetadata }) {
  const creditParts = [
    meta.artist && `von ${meta.artist}`,
    meta.composer && `Musik: ${meta.composer}`,
    meta.lyricist && `Text: ${meta.lyricist}`,
  ].filter(Boolean)

  const albumLine = [meta.album, meta.year].filter(Boolean).join(' · ')

  const badges = [
    meta.key && { label: 'Tonart', value: meta.key },
    meta.capo && { label: 'Capo', value: meta.capo },
    meta.time && { label: 'Takt', value: meta.time },
    meta.tempo && { label: 'Tempo', value: `${meta.tempo} BPM` },
    meta.duration && { label: 'Dauer', value: meta.duration },
  ].filter((x): x is { label: string; value: string } => Boolean(x))

  const metaEntries = meta.meta ? Object.entries(meta.meta) : []

  const hasAnything =
    meta.title ||
    meta.subtitle ||
    creditParts.length > 0 ||
    albumLine ||
    badges.length > 0 ||
    meta.copyright ||
    metaEntries.length > 0

  if (!hasAnything) return null

  return (
    <header className="chord-sheet-meta">
      {meta.title && (
        <h1 className="chord-sheet-meta-title">
          <span>{meta.title}</span>
          {meta.titleNotes?.map((note, i) => (
            <span key={i} className="chord-sheet-meta-title-note">{note}</span>
          ))}
        </h1>
      )}
      {meta.subtitle && <div className="chord-sheet-meta-subtitle">{meta.subtitle}</div>}
      {creditParts.length > 0 && (
        <div className="chord-sheet-meta-credits">{creditParts.join(' · ')}</div>
      )}
      {albumLine && <div className="chord-sheet-meta-album">{albumLine}</div>}
      {badges.length > 0 && (
        <div className="chord-sheet-meta-badges">
          {badges.map((b) => (
            <span key={b.label} className="chord-sheet-meta-badge">
              <span className="chord-sheet-meta-badge-label">{b.label}</span>
              <span className="chord-sheet-meta-badge-value">{b.value}</span>
            </span>
          ))}
        </div>
      )}
      {metaEntries.length > 0 && (
        <dl className="chord-sheet-meta-extra">
          {metaEntries.map(([k, values]) => (
            <div key={k} className="chord-sheet-meta-extra-row">
              <dt>{k}</dt>
              <dd>{values.join(', ')}</dd>
            </div>
          ))}
        </dl>
      )}
      {meta.copyright && (
        <div className="chord-sheet-meta-copyright">© {meta.copyright}</div>
      )}
    </header>
  )
}

function ChordLineView({
  line,
  transposition,
  flats,
  hideChords,
  hideVocal,
}: {
  line: ChordLine
  transposition: number
  flats: boolean
  hideChords: boolean
  hideVocal: boolean
}) {
  if (line.isBlank) {
    return <div className="chord-line chord-line-blank" aria-hidden="true">&nbsp;</div>
  }

  if (
    line.chords.length === 0 &&
    !line.text &&
    !line.annotations?.length &&
    !line.vocalMarks?.length
  ) return null

  const annotations = line.annotations?.length ? (
    <>
      {line.annotations.map((a, i) => (
        <span key={i} className="chord-annotation">{a}</span>
      ))}
    </>
  ) : null

  const commentClass = line.isComment
    ? ` chord-line-comment chord-line-comment-${line.commentStyle ?? 'plain'}`
    : ''

  const showVocal = !hideVocal && !!line.vocalMarks?.length
  const lineFormats = hideVocal ? undefined : line.formats

  // Beat-Marks: Unterstrich. Note-top/bottom: Pills. Note-inline: between chars.
  const allMarks: VocalMarkPosition[] = showVocal ? (line.vocalMarks || []) : []
  const overlayMarks = allMarks.filter(m => {
    const meta = getVocalMeta(m.token)
    return meta && (meta.category === 'note-top' || meta.category === 'note-bottom')
  })
  const beatCols = new Set<number>(
    allMarks.filter(m => getVocalMeta(m.token)?.category === 'beat').map(m => m.col),
  )
  const inlineNotes = new Map<number, string>()
  for (const m of allMarks) {
    const meta = getVocalMeta(m.token)
    if (meta?.category === 'note-inline') inlineNotes.set(m.col, m.token)
  }

  // Split overlays into top and bottom for separate rows
  const notesTop = overlayMarks.filter(m => getVocalMeta(m.token)?.category === 'note-top')
  const notesBottom = overlayMarks.filter(m => getVocalMeta(m.token)?.category === 'note-bottom')

  const topRow = notesTop.length > 0 ? (
    <div className="vocal-row vocal-row--top">
      {notesTop.map((m, i) => {
        const meta = getVocalMeta(m.token)!
        return (
          <span
            key={i}
            className="vocal-note-label vocal-note-label--top"
            style={{ left: `${m.col}ch` }}
            title={meta.label}
          >
            <span className="vocal-note-label-text">{meta.symbol}</span>
          </span>
        )
      })}
    </div>
  ) : null

  const bottomRow = notesBottom.length > 0 ? (
    <div className="vocal-row vocal-row--bottom">
      {notesBottom.map((m, i) => {
        const meta = getVocalMeta(m.token)!
        return (
          <span
            key={i}
            className="vocal-note-label vocal-note-label--bottom"
            style={{ left: `${m.col}ch` }}
            title={meta.label}
          >
            <span className="vocal-note-label-text">{meta.symbol}</span>
          </span>
        )
      })}
    </div>
  ) : null

  // Legacy: any non-note overlay marks (shouldn't exist in current scope but safe)
  const otherOverlays = overlayMarks.filter(m => {
    const cat = getVocalMeta(m.token)?.category
    return cat !== 'note-top' && cat !== 'note-bottom'
  })
  const vocalRow = otherOverlays.length > 0 ? (
    <div className="vocal-row">
      {otherOverlays.map((m, i) => {
        const meta = getVocalMeta(m.token)!
        return (
          <span
            key={i}
            className={`vocal-row-mark vocal-mark vocal-mark--${meta.category}`}
            style={{ left: `${m.col}ch` }}
            title={meta.label}
          >
            {meta.symbol}
          </span>
        )
      })}
    </div>
  ) : null

  // No chords, or chords hidden → plain text row, no chord-row overlay
  if (line.chords.length === 0 || hideChords) {
    return (
      <div className={`chord-line${commentClass}`}>
        {topRow}
        {vocalRow}
        <div className="chord-text">
          {renderTextWithAnchors(line.text, new Set(), beatCols, inlineNotes, lineFormats)}
          {annotations}
        </div>
        {bottomRow}
      </div>
    )
  }

  // Build chord overlay using character positions
  const transposedChords = line.chords.map((c) => ({
    chord: transposeChord(c.chord, transposition, flats),
    col: c.col,
  }))

  const anchorCols = new Set(line.chords.map((c) => c.col))

  return (
    <div className={`chord-line${commentClass}`}>
      {vocalRow}
      <div className="chord-row">
        {transposedChords.map((c, i) => (
          <span
            key={i}
            className="chord-symbol"
            style={{ left: `${c.col}ch` }}
          >
            {c.chord}
          </span>
        ))}
      </div>
      {(line.text || annotations) && (
        <div className="chord-text">
          {renderTextWithAnchors(line.text, anchorCols, beatCols, inlineNotes, lineFormats)}
          {annotations}
        </div>
      )}
      {bottomRow}
    </div>
  )
}

/**
 * Render lyric text as a sequence of spans. Characters at chord-anchor
 * positions get `.chord-anchor`, those at beat positions get
 * `.vocal-beat-anchor`. A character that is both becomes both.
 * Preserves whitespace (parent uses `white-space: pre`).
 */
function formatClassName(f?: ChordLineFormat): string {
  if (!f) return ''
  let cls = ''
  if (f.b) cls += ' chord-text-fmt-b'
  if (f.i) cls += ' chord-text-fmt-i'
  if (f.u) cls += ' chord-text-fmt-u'
  if (f.s) cls += ' chord-text-fmt-s'
  if (f.color) cls += ` chord-text-clr-${f.color}`
  if (f.bg) cls += ` chord-text-bg-${f.bg}`
  return cls
}

function formatsEqual(a?: ChordLineFormat, b?: ChordLineFormat): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    !!a.b === !!b.b &&
    !!a.i === !!b.i &&
    !!a.u === !!b.u &&
    !!a.s === !!b.s &&
    (a.color ?? '') === (b.color ?? '') &&
    (a.bg ?? '') === (b.bg ?? '')
  )
}

function renderTextWithAnchors(
  text: string,
  anchorCols: Set<number>,
  beatCols: Set<number>,
  inlineNotes: Map<number, string>,
  formats?: Record<number, ChordLineFormat>,
): ReactNode {
  const hasFormats = formats && Object.keys(formats).length > 0
  if (
    anchorCols.size === 0 &&
    beatCols.size === 0 &&
    inlineNotes.size === 0 &&
    !hasFormats
  ) {
    return text
  }
  const parts: ReactNode[] = []
  let run = ''
  let runFmt: ChordLineFormat | undefined = undefined
  const flush = () => {
    if (!run) return
    if (runFmt) {
      parts.push(
        <span key={`rf-${parts.length}`} className={formatClassName(runFmt).trim()}>{run}</span>,
      )
    } else {
      parts.push(run)
    }
    run = ''
    runFmt = undefined
  }
  for (let i = 0; i < text.length; i++) {
    const noteToken = inlineNotes.get(i)
    if (noteToken) {
      flush()
      const meta = getVocalMeta(noteToken)
      if (meta) {
        parts.push(
          <span key={`ni-${i}`} className="vocal-note-inline">{meta.label}</span>,
        )
      }
    }
    const isAnchor = anchorCols.has(i)
    const isBeat = beatCols.has(i)
    const f = formats?.[i]
    if (isAnchor || isBeat) {
      flush()
      const cls =
        (isAnchor ? 'chord-anchor' : '') +
        (isBeat ? (isAnchor ? ' vocal-beat-anchor' : 'vocal-beat-anchor') : '') +
        formatClassName(f)
      parts.push(<span key={i} className={cls}>{text[i]}</span>)
    } else {
      if (!formatsEqual(f, runFmt)) flush()
      runFmt = f
      run += text[i]
    }
  }
  flush()
  return parts
}
