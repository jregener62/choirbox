import { parseTrackFilename } from '@/utils/parseTrackFilename'
import { formatSectionLabel } from '@/utils/buildBatchGrid'

const VOICE_COLORS: Record<string, string> = {
  S: 'var(--sopran)',
  A: 'var(--alt)',
  T: 'var(--tenor)',
  B: 'var(--bass)',
}

const VOICE_LABELS: Record<string, string> = {
  S: 'Sopran',
  A: 'Alt',
  T: 'Tenor',
  B: 'Bass',
}

// Sections get their own muted/cool palette, visually distinct from the bright voice colors
const SECTION_COLORS: Record<string, string> = {
  intro: 'var(--sec-intro)',
  strophe: 'var(--sec-strophe)',
  refrain: 'var(--sec-refrain)',
  bridge: 'var(--sec-bridge)',
  outro: 'var(--sec-outro)',
}

function voiceColor(voiceKey: string): string {
  if (voiceKey.length === 1) return VOICE_COLORS[voiceKey] || 'var(--satb)'
  return 'var(--satb)'
}

function voiceDisplay(voiceKey: string): string {
  if (voiceKey.length === 1) return VOICE_LABELS[voiceKey] || voiceKey
  return voiceKey.split('').map(l => VOICE_LABELS[l] || l).join('+')
}

function sectionColor(sectionKey: string): string {
  // Extract the base section name (e.g. "Strophe" from "Strophe1+Refrain2")
  const first = sectionKey.split('+')[0]
  const base = first.replace(/\d+$/, '').toLowerCase()
  return SECTION_COLORS[base] || 'var(--sec-strophe)'
}

interface TrackBadgesProps {
  filename: string
  folderName: string
  size?: 'sm' | 'md'
  inline?: boolean
}

export function TrackBadges({ filename, folderName, size = 'sm', inline = false }: TrackBadgesProps) {
  const parsed = parseTrackFilename(filename, folderName)
  if (!parsed) return null

  const chipClass = size === 'sm' ? 'label-chip-sm' : 'label-chip'
  const vColor = voiceColor(parsed.voiceKey)
  const sectionLabel = parsed.sectionKey !== 'Gesamt'
    ? formatSectionLabel(parsed.sectionKey)
    : null
  const sColor = sectionLabel ? sectionColor(parsed.sectionKey) : null

  const chips = (
    <>
      <span
        className={chipClass}
        style={{ background: vColor, color: 'white' }}
      >
        {voiceDisplay(parsed.voiceKey)}
      </span>
      {sectionLabel && sColor && (
        <span
          className={chipClass}
          style={{ background: sColor + '20', color: sColor, border: `1px solid ${sColor}` }}
        >
          {sectionLabel}
        </span>
      )}
    </>
  )

  if (inline) return chips
  return <div className="file-labels">{chips}</div>
}
