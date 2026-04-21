import { Plus, Minus } from 'lucide-react'

/** -12..+12-Stepper fuer ChordPro-Transposition. Haelt selbst keinen State;
 *  der Chord-Preference-Hook liefert den Wert und speichert Aenderungen. */
export function TransposeButtons({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  return (
    <>
      <button
        className="transpose-stepper-btn"
        onClick={() => onChange(value - 1)}
        disabled={value <= -12}
        aria-label="Transponieren -1"
      >
        <Minus size={16} />
      </button>
      <span className="transpose-stepper-value">
        {value > 0 ? `+${value}` : value}
      </span>
      <button
        className="transpose-stepper-btn"
        onClick={() => onChange(value + 1)}
        disabled={value >= 12}
        aria-label="Transponieren +1"
      >
        <Plus size={16} />
      </button>
    </>
  )
}
