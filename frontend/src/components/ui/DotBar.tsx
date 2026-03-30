interface DotBarProps {
  count: number
  activeIndex: number
  onDotClick: (index: number) => void
}

export function DotBar({ count, activeIndex, onDotClick }: DotBarProps) {
  return (
    <div className="dot-bar">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          className={`dot${i === activeIndex ? ' dot--active' : ''}`}
          onClick={() => onDotClick(i)}
        />
      ))}
    </div>
  )
}
