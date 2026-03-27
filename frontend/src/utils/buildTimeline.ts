import type { Section } from '@/types/index.ts'

export interface TimelineEntry {
  id: number | null
  label: string | null
  color: string | null
  start_time: number
  end_time: number
  isGap: boolean
}

/**
 * Build a gapless timeline from sections + track duration.
 * Gaps between sections (and before first / after last) are filled
 * with virtual entries (isGap: true) that are loopable but not stored in DB.
 */
export function buildTimeline(sections: Section[], duration: number): TimelineEntry[] {
  if (duration <= 0) return []

  const sorted = [...sections].sort((a, b) => a.start_time - b.start_time)
  const timeline: TimelineEntry[] = []
  let cursor = 0

  for (const s of sorted) {
    if (s.start_time > cursor) {
      timeline.push({
        id: null,
        label: null,
        color: null,
        start_time: cursor,
        end_time: s.start_time,
        isGap: true,
      })
    }
    timeline.push({
      id: s.id,
      label: s.label,
      color: s.color,
      start_time: s.start_time,
      end_time: s.end_time,
      isGap: false,
    })
    cursor = s.end_time
  }

  if (cursor < duration) {
    timeline.push({
      id: null,
      label: null,
      color: null,
      start_time: cursor,
      end_time: duration,
      isGap: true,
    })
  }

  return timeline
}
