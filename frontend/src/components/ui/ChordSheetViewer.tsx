import { Fragment, useMemo } from 'react'
import { transposeChord, shouldUseFlats } from '@/utils/chordTransposer'
import type { ChordLine, ChordSheetMetadata, ParsedChordContent } from '@/types/index'
import './ChordSheetViewer.css'

interface ChordSheetViewerProps {
  content: ParsedChordContent
  transposition: number
  /** Wenn true: Akkord-Zeilen komplett ausblenden (reiner Text-Modus).
   *  Metadata, Section-Labels und Kommentare bleiben sichtbar. */
  hideChords?: boolean
}

export function ChordSheetViewer({ content, transposition, hideChords = false }: ChordSheetViewerProps) {
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
}: {
  line: ChordLine
  transposition: number
  flats: boolean
  hideChords: boolean
}) {
  if (line.isBlank) {
    return <div className="chord-line chord-line-blank" aria-hidden="true">&nbsp;</div>
  }

  if (
    line.chords.length === 0 &&
    !line.text &&
    !line.annotations?.length
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

  // No chords, or chords hidden → plain text row, no chord-row overlay
  if (line.chords.length === 0 || hideChords) {
    return (
      <div className={`chord-line${commentClass}`}>
        <div className="chord-text chord-text--wrap">
          {line.text}
          {annotations}
        </div>
      </div>
    )
  }

  // Inline flow rendering: each character becomes a "cell" stacking the
  // chord (top) over the lyric char (bottom). Cells inside a word are
  // glued together; whitespace cells without a chord are wrap points so
  // the line reflows when horizontal space is tight.
  const transposedChords = line.chords.map((c) => ({
    chord: transposeChord(c.chord, transposition, flats),
    col: c.col,
  }))
  const chordByCol = new Map<number, string>(
    transposedChords.map((c) => [c.col, c.chord]),
  )
  const maxCol = Math.max(
    line.text.length,
    ...transposedChords.map((c) => c.col + 1),
  )

  type Cell = { char: string; chord?: string; col: number }
  type Token = { type: 'word' | 'space'; cells: Cell[] }
  const tokens: Token[] = []
  let curr: Token | null = null
  for (let i = 0; i < maxCol; i++) {
    const ch = line.text[i] ?? ' '
    const chord = chordByCol.get(i)
    const isSpace = (ch === ' ' || ch === '\t') && chord === undefined
    const want: Token['type'] = isSpace ? 'space' : 'word'
    if (!curr || curr.type !== want) {
      curr = { type: want, cells: [] }
      tokens.push(curr)
    }
    curr.cells.push({ char: ch, chord, col: i })
  }

  // Trim a trailing all-blank space token (cells without chord, only spaces)
  // so we don't draw phantom width at end of line.
  while (
    tokens.length > 0 &&
    tokens[tokens.length - 1].type === 'space' &&
    tokens[tokens.length - 1].cells.every((c) => !c.chord)
  ) {
    tokens.pop()
  }

  return (
    <div className={`chord-line chord-line--flow${commentClass}`}>
      <div className="chord-flow">
        {tokens.map((tok, ti) => {
          if (tok.type === 'space') {
            // Render whitespace as plain text so the browser can break here.
            return (
              <Fragment key={ti}>{tok.cells.map((c) => c.char).join('')}</Fragment>
            )
          }
          return (
            <span key={ti} className="chord-flow-word">
              {tok.cells.map((c, ci) => (
                <span
                  key={ci}
                  className={`chord-flow-cell${c.chord ? ' chord-flow-cell--anchor' : ''}`}
                >
                  {c.chord && (
                    <span className="chord-flow-chord">{c.chord}</span>
                  )}
                  {c.char === ' ' ? ' ' : c.char}
                </span>
              ))}
            </span>
          )
        })}
        {annotations}
      </div>
    </div>
  )
}
