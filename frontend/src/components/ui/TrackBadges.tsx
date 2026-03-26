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

const VOICE_LABELS: Record<string, string> = {
  S: 'Sopran',
  A: 'Alt',
  T: 'Tenor',
  B: 'Bass',
}

function voiceDisplay(voiceKey: string): string {
  if (voiceKey.length === 1) return VOICE_LABELS[voiceKey] || voiceKey
  return voiceKey.split('').map(l => VOICE_LABELS[l] || l).join('+')
}

export function TrackBadges({ filename, folderName, size = 'sm', inline = false }: TrackBadgesProps) {
  const parsed = parseTrackFilename(filename, folderName)
  if (!parsed) return null

  const chipClass = size === 'sm' ? 'label-chip-sm' : 'label-chip'
  const color = voiceColor(parsed.voiceKey)
  const sectionLabel = parsed.sectionKey !== 'Gesamt'
    ? formatSectionLabel(parsed.sectionKey)
    : null

  const chips = (
    <>
      <span
        className={chipClass}
        style={{ background: color, color: 'white' }}
      >
        {voiceDisplay(parsed.voiceKey)}
      </span>
      {sectionLabel && (
        <span
          className={chipClass}
          style={{ color, border: `1px solid ${color}`, background: 'none' }}
        >
          {sectionLabel}
        </span>
      )}
    </>
  )

  if (inline) return chips
  return <div className="file-labels">{chips}</div>
}
