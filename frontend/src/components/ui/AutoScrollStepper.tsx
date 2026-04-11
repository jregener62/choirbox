import { ChevronsDown, Plus, Minus, ChevronUp, ChevronDown } from 'lucide-react'
import { usePlayerStore, AUTO_SCROLL_SPEEDS } from '@/stores/playerStore.ts'

interface AutoScrollStepperProps {
  faded?: boolean
  onInteract?: () => void
  onPageUp?: () => void
  onPageDown?: () => void
}

export function AutoScrollStepper({ faded = false, onInteract, onPageUp, onPageDown }: AutoScrollStepperProps) {
  const enabled = usePlayerStore((s) => s.autoScrollEnabled)
  const speedIdx = usePlayerStore((s) => s.autoScrollSpeedIdx)
  const setEnabled = usePlayerStore((s) => s.setAutoScrollEnabled)
  const setSpeedIdx = usePlayerStore((s) => s.setAutoScrollSpeedIdx)

  const speed = AUTO_SCROLL_SPEEDS[speedIdx]
  const isMin = speedIdx === 0
  const isMax = speedIdx === AUTO_SCROLL_SPEEDS.length - 1

  const handleToggle = () => {
    setEnabled(!enabled)
    onInteract?.()
  }
  const handleMinus = () => {
    setSpeedIdx(speedIdx - 1)
    onInteract?.()
  }
  const handlePlus = () => {
    setSpeedIdx(speedIdx + 1)
    onInteract?.()
  }
  const handlePageUp = () => {
    onPageUp?.()
    onInteract?.()
  }
  const handlePageDown = () => {
    onPageDown?.()
    onInteract?.()
  }

  return (
    <div
      className={`autoscroll-stepper${faded ? ' autoscroll-stepper--faded' : ''}`}
      onTouchStart={onInteract}
    >
      <button
        type="button"
        className={`autoscroll-stepper-icon${enabled ? ' autoscroll-stepper-icon--on' : ''}`}
        onClick={handleToggle}
        aria-label={enabled ? 'Autoscroll stoppen' : 'Autoscroll starten'}
        aria-pressed={enabled}
      >
        <ChevronsDown size={20} />
      </button>
      <div className="autoscroll-stepper-divider" />
      <button
        type="button"
        className="autoscroll-stepper-btn"
        onClick={handleMinus}
        disabled={!enabled || isMin}
        aria-label="Langsamer scrollen"
      >
        <Minus size={14} />
      </button>
      <span
        className={`autoscroll-stepper-value${enabled ? '' : ' autoscroll-stepper-value--off'}`}
      >
        {enabled ? `${speed}×` : 'Aus'}
      </span>
      <button
        type="button"
        className="autoscroll-stepper-btn"
        onClick={handlePlus}
        disabled={!enabled || isMax}
        aria-label="Schneller scrollen"
      >
        <Plus size={14} />
      </button>
      {(onPageUp || onPageDown) && (
        <>
          <div className="autoscroll-stepper-divider" />
          <button
            type="button"
            className="autoscroll-stepper-btn"
            onClick={handlePageUp}
            disabled={!onPageUp}
            aria-label="Eine Seite nach oben"
          >
            <ChevronUp size={16} />
          </button>
          <button
            type="button"
            className="autoscroll-stepper-btn"
            onClick={handlePageDown}
            disabled={!onPageDown}
            aria-label="Eine Seite nach unten"
          >
            <ChevronDown size={16} />
          </button>
        </>
      )}
    </div>
  )
}
