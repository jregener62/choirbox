/**
 * Chord sheet text parser — converts raw .cho text into ParsedChordContent.
 *
 * Supports the "chord-line above lyrics" style (Ultimate Guitar / classic
 * chord sheet format), with optional [Section] headers.
 *
 * Mirrors the format produced by the previous backend chord_parser.py so the
 * existing ChordSheetViewer renders identically.
 */

import type { ParsedChordContent, ChordPosition, ChordSection } from '@/types/index'

// Chord symbol pattern: root + optional quality/extension/bass
const CHORD_PATTERN =
  /\b([A-G][b#]?(?:m(?:aj|in)?|maj|dim|aug|sus)?(?:2|4|5|6|7|9|11|13|add[0-9]+|no[0-9]+)?(?:sus[24]?)?(?:\/[A-G][b#]?)?)\b/g

const SECTION_PATTERN = /^\[([A-Za-z0-9\s+\-.]+)\]\s*$/

const CHORD_RE = /^([A-G][b#]?)/

function isChordLine(line: string): boolean {
  const stripped = line.trim()
  if (!stripped) return false

  const matches = Array.from(stripped.matchAll(new RegExp(CHORD_PATTERN.source, 'g')))
  if (matches.length === 0) return false

  const chordChars = matches.reduce((sum, m) => sum + m[0].length, 0)
  const nonWs = stripped.replace(/\s/g, '').length
  if (nonWs === 0) return false

  const chordRatio = chordChars / nonWs

  // Check for long non-chord words (would disqualify the line)
  let remaining = stripped.replace(new RegExp(CHORD_PATTERN.source, 'g'), '').trim()
  remaining = remaining.replace(/[x\d()\-/\s|]+/g, '')

  if (remaining.length > 3) return false

  return chordRatio > 0.5
}

function extractChordsWithPositions(line: string): ChordPosition[] {
  const out: ChordPosition[] = []
  for (const match of line.matchAll(new RegExp(CHORD_PATTERN.source, 'g'))) {
    if (match.index === undefined) continue
    out.push({ chord: match[1], col: match.index })
  }
  return out
}

function isSectionHeader(line: string): string | null {
  const m = line.trim().match(SECTION_PATTERN)
  return m ? m[1].trim() : null
}

function classifySectionType(label: string): string {
  const l = label.toLowerCase()
  if (l.includes('verse') || l.includes('strophe')) return 'verse'
  if (l.includes('chorus') || l.includes('refrain')) return 'chorus'
  if (l.includes('bridge')) return 'bridge'
  if (l.includes('intro')) return 'intro'
  if (l.includes('outro')) return 'outro'
  if (l.includes('solo')) return 'solo'
  if (l.includes('pre-chorus') || l.includes('pre chorus')) return 'pre-chorus'
  return 'other'
}

function detectKey(chords: string[]): { key: string; confidence: number } {
  if (chords.length === 0) return { key: 'C', confidence: 0 }

  const roots: string[] = []
  for (const chord of chords) {
    const m = chord.trim().match(CHORD_RE)
    if (m) roots.push(m[1])
  }
  if (roots.length === 0) return { key: 'C', confidence: 0 }

  // Weight: first chord x3, last chord x2, all others x1
  const weighted: Record<string, number> = {}
  roots.forEach((root, i) => {
    const weight = i === 0 ? 3 : i === roots.length - 1 ? 2 : 1
    weighted[root] = (weighted[root] || 0) + weight
  })

  const sorted = Object.entries(weighted).sort((a, b) => b[1] - a[1])
  const [topRoot, topWeight] = sorted[0]
  const totalWeight = Object.values(weighted).reduce((a, b) => a + b, 0)
  const confidence = Math.min((topWeight / totalWeight) * 2, 1.0)

  return { key: topRoot, confidence: Math.round(confidence * 100) / 100 }
}

/**
 * Parse raw chord-sheet text into the structured format the viewer expects.
 */
export function parseChordText(text: string): ParsedChordContent {
  const lines = text.split('\n')
  const sections: ChordSection[] = []
  let currentSection: ChordSection = { type: 'intro', label: '', lines: [] }
  const allChords: string[] = []
  let pendingChords: ChordPosition[] | null = null

  const flushPendingAsInstrumental = () => {
    if (pendingChords !== null) {
      currentSection.lines.push({ text: '', chords: pendingChords })
      pendingChords = null
    }
  }

  for (const rawLine of lines) {
    const stripped = rawLine.replace(/\s+$/, '')

    if (!stripped.trim()) {
      flushPendingAsInstrumental()
      continue
    }

    const sectionLabel = isSectionHeader(stripped)
    if (sectionLabel !== null) {
      flushPendingAsInstrumental()
      if (currentSection.lines.length > 0) {
        sections.push(currentSection)
      }
      currentSection = {
        type: classifySectionType(sectionLabel),
        label: `[${sectionLabel}]`,
        lines: [],
      }
      continue
    }

    if (isChordLine(stripped)) {
      flushPendingAsInstrumental()
      const chords = extractChordsWithPositions(stripped)
      allChords.push(...chords.map((c) => c.chord))
      pendingChords = chords
      continue
    }

    // Lyrics line — pair with pending chords (if any)
    if (pendingChords !== null) {
      currentSection.lines.push({ text: stripped, chords: pendingChords })
      pendingChords = null
    } else {
      currentSection.lines.push({ text: stripped, chords: [] })
    }
  }

  flushPendingAsInstrumental()
  if (currentSection.lines.length > 0) {
    sections.push(currentSection)
  }

  const uniqueChords = Array.from(new Set(allChords))
  const { key, confidence } = detectKey(allChords)

  return {
    sections,
    all_chords: uniqueChords,
    detected_key: key,
    key_confidence: confidence,
  }
}
