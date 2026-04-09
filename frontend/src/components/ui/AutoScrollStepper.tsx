import { ChevronsDown, Plus, Minus } from 'lucide-react'
import { usePlayerStore, AUTO_SCROLL_SPEEDS } from '@/stores/playerStore.ts'

interface AutoScrollStepperProps {
  faded?: boolean
  onInteract?: () => void
}

export function AutoScrollStepper({ faded = false, onInteract }: AutoScrollStepperProps) {
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
    </div>
  )
}
