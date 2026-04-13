import { useMemo } from 'react'
import { transposeChord, shouldUseFlats } from '@/utils/chordTransposer'
import type { ParsedChordContent, ChordLine } from '@/types/index'
import './ChordSheetViewer.css'

interface ChordSheetViewerProps {
  content: ParsedChordContent
  transposition: number
}

export function ChordSheetViewer({ content, transposition }: ChordSheetViewerProps) {
  const flats = useMemo(
    () => shouldUseFlats(content.all_chords || []),
    [content.all_chords],
  )

  return (
    <div className="chord-sheet-viewer">
      {content.sections.map((section, si) => (
        <div key={si} className="chord-section">
          {section.label && (
            <div className={`chord-section-label chord-section-${section.type}`}>
              {section.label}
            </div>
          )}
          {section.lines.map((line, li) => (
            <ChordLineView
              key={li}
              line={line}
              transposition={transposition}
              flats={flats}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function ChordLineView({
  line,
  transposition,
  flats,
}: {
  line: ChordLine
  transposition: number
  flats: boolean
}) {
  if (line.chords.length === 0 && !line.text && !line.annotations?.length) return null

  const annotations = line.annotations?.length ? (
    <>
      {line.annotations.map((a, i) => (
        <span key={i} className="chord-annotation">{a}</span>
      ))}
    </>
  ) : null

  // No chords — just text
  if (line.chords.length === 0) {
    return (
      <div className={`chord-line${line.isComment ? ' chord-line-comment' : ''}`}>
        <div className="chord-text">
          {line.text}
          {annotations}
        </div>
      </div>
    )
  }

  // Build chord overlay using character positions
  const transposedChords = line.chords.map((c) => ({
    chord: transposeChord(c.chord, transposition, flats),
    col: c.col,
  }))

  return (
    <div className="chord-line">
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
          {line.text}
          {annotations}
        </div>
      )}
    </div>
  )
}
