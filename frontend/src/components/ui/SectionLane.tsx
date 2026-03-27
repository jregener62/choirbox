import type { Section } from '@/types/index.ts'

interface SectionLaneProps {
  sections: Section[]
  duration: number
  activeSectionId: number | null
  onSectionClick: (section: Section) => void
}

export function SectionLane({ sections, duration, activeSectionId, onSectionClick }: SectionLaneProps) {
  if (sections.length === 0 || duration <= 0) return null

  return (
    <div className="section-lane">
      {sections.map((s) => {
        const isActive = s.id === activeSectionId
        const widthPct = ((s.end_time - s.start_time) / duration) * 100
        const leftPct = (s.start_time / duration) * 100

        return (
          <button
            key={s.id}
            className={`section-block ${isActive ? 'section-block--active' : ''}`}
            style={{
              position: 'absolute',
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              background: isActive ? s.color : s.color + '30',
              color: isActive ? '#fff' : s.color,
              borderColor: s.color,
            }}
            onClick={() => onSectionClick(s)}
          >
            <span className="section-block-label">{s.label}</span>
          </button>
        )
      })}
    </div>
  )
}
