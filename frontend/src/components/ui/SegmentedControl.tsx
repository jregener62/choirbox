import { useRef, useLayoutEffect, useState, createElement } from 'react'
import { getFolderTypeConfig } from '@/utils/folderTypeConfig'
import type { SubFolderInfo } from '@/types/index'

interface SegmentedControlProps {
  segments: SubFolderInfo[]
  activeType: string | null
  onSelect: (segment: SubFolderInfo) => void
}

export function SegmentedControl({ segments, activeType, onSelect }: SegmentedControlProps) {
  const segRefs = useRef<(HTMLButtonElement | null)[]>([])
  const trackRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  const activeIdx = segments.findIndex((s) => s.name.toLowerCase() === activeType?.toLowerCase())
  const activeConfig = activeIdx >= 0 ? getFolderTypeConfig(segments[activeIdx].type) : null

  useLayoutEffect(() => {
    const el = segRefs.current[activeIdx]
    const track = trackRef.current
    if (el && track) {
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth })
    }
  }, [activeIdx, segments.length])

  return (
    <div className="segmented-control">
      <div className="segmented-control__track" ref={trackRef}>
        {indicator && activeConfig && (
          <div
            className="segmented-control__indicator"
            style={{
              left: indicator.left,
              width: indicator.width,
              background: activeConfig.activeBgColor,
              borderColor: activeConfig.borderColor,
            }}
          />
        )}
        {segments.map((seg, i) => {
          const config = getFolderTypeConfig(seg.type)
          const isActive = i === activeIdx
          return (
            <button
              key={seg.type}
              ref={(el) => { segRefs.current[i] = el }}
              className={`segmented-control__segment${isActive ? ' segmented-control__segment--active' : ''}`}
              style={isActive ? { color: config.color } : undefined}
              onClick={() => onSelect(seg)}
              role="tab"
              aria-selected={isActive}
            >
              {createElement(config.icon, { size: 14 })}
              <span className="segmented-control__label">{seg.name}</span>
              <span className="segmented-control__count">{seg.count}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
