import type { MouseEvent } from 'react'
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import './TagToolbar.css'

interface TagToolbarProps {
  style: { top: number; left: number; flipped: boolean }
  canMoveLeft: boolean
  canMoveRight: boolean
  onMoveLeft: () => void
  onMoveRight: () => void
  onDelete: () => void
}

/** Schwebende Toolbar ueber dem selektierten Tag im SheetEditor: verschiebt
 *  das Tag zeichenweise oder loescht es. Alle Button-MouseDowns sind per
 *  preventDefault abgefangen, damit die Textarea-Selektion waehrend der
 *  Aktion erhalten bleibt. */
export function TagToolbar({
  style,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  onDelete,
}: TagToolbarProps) {
  const preventBlur = (e: MouseEvent) => e.preventDefault()
  return (
    <div
      className={`tag-toolbar ${style.flipped ? 'tag-toolbar--below' : ''}`}
      style={{ top: style.top, left: style.left }}
      onMouseDown={preventBlur}
    >
      <button
        type="button"
        className="tag-toolbar-btn"
        disabled={!canMoveLeft}
        onClick={onMoveLeft}
        aria-label="Ein Zeichen nach links verschieben"
        title="Ein Zeichen nach links verschieben"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        type="button"
        className="tag-toolbar-btn"
        disabled={!canMoveRight}
        onClick={onMoveRight}
        aria-label="Ein Zeichen nach rechts verschieben"
        title="Ein Zeichen nach rechts verschieben"
      >
        <ChevronRight size={22} />
      </button>
      <span className="tag-toolbar-sep" aria-hidden="true" />
      <button
        type="button"
        className="tag-toolbar-btn tag-toolbar-btn--danger"
        onClick={onDelete}
        aria-label="Tag loeschen"
        title="Tag loeschen"
      >
        <Trash2 size={20} />
      </button>
    </div>
  )
}
