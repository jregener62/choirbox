import { parseTrackFilename } from '@/utils/parseTrackFilename'
import { formatSectionLabel } from '@/utils/buildBatchGrid'

const VOICE_COLORS: Record<string, string> = {
  S: 'var(--sopran)',
  A: 'var(--alt)',
  T: 'var(--tenor)',
  B: 'var(--bass)',
}

function voiceColor(voiceKey: string): string {
  if (voiceKey.length === 1) return VOICE_COLORS[voiceKey] || 'var(--satb)'
  return 'var(--satb)'
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

  // Only show section badges (not voice name or freetext)
  const sectionLabel = parsed.sectionKey !== 'Gesamt'
    ? formatSectionLabel(parsed.sectionKey)
    : null

  if (!sectionLabel) return null

  const chipClass = size === 'sm' ? 'label-chip-sm' : 'label-chip'
  const color = voiceColor(parsed.voiceKey)

  const chip = (
    <span
      className={chipClass}
      style={{ color, border: `1px solid ${color}`, background: 'none' }}
    >
      {sectionLabel}
    </span>
  )

  if (inline) return chip
  return <div className="file-labels">{chip}</div>
}
