import { parseTrackFilename } from '@/utils/parseTrackFilename'
import { formatSectionLabel } from '@/utils/buildBatchGrid'

const SECTION_COLOR = 'var(--sec-color)'

interface TrackBadgesProps {
  filename: string
  folderName: string
  size?: 'sm' | 'md'
  inline?: boolean
}

export function TrackBadges({ filename, folderName, size = 'sm', inline = false }: TrackBadgesProps) {
  const parsed = parseTrackFilename(filename, folderName)
  if (!parsed) return null

  const sectionLabel = parsed.sectionKey !== 'Gesamt'
    ? formatSectionLabel(parsed.sectionKey)
    : null

  if (!sectionLabel) return null

  const chipClass = size === 'sm' ? 'label-chip-sm' : 'label-chip'

  const chip = (
    <span
      className={chipClass}
      style={{ background: SECTION_COLOR + '20', color: SECTION_COLOR, border: `1px solid ${SECTION_COLOR}` }}
    >
      {sectionLabel}
    </span>
  )

  if (inline) return chip
  return <div className="file-labels">{chip}</div>
}
