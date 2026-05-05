import { useMemo } from 'react'
import { Pen, Highlighter, Eraser, Hand, Undo2, Trash2 } from 'lucide-react'
import { useAnnotationStore, type AnnotationTool } from '@/hooks/useAnnotations.ts'

const PEN_COLORS = [
  { value: '#ef4444', label: 'Rot' },
  { value: '#3b82f6', label: 'Blau' },
  { value: '#22c55e', label: 'Gruen' },
  { value: '#eab308', label: 'Gelb' },
  { value: '#a855f7', label: 'Lila' },
  { value: '#1e1e1e', label: 'Schwarz' },
]

const HIGHLIGHTER_COLORS = [
  { value: '#fff200', label: 'Gelb' },
  { value: '#39ff14', label: 'Gruen' },
  { value: '#00d4ff', label: 'Blau' },
  { value: '#c8c8c8', label: 'Grau' },
]

const WIDTHS = [
  { value: 2, label: 'Fein' },
  { value: 4, label: 'Mittel' },
  { value: 8, label: 'Dick' },
]

interface AnnotationToolbarProps {
  pageKey: string
}

export function AnnotationToolbar({ pageKey }: AnnotationToolbarProps) {
  const tool = useAnnotationStore((s) => s.tool)
  const color = useAnnotationStore((s) => s.color)
  const strokeWidth = useAnnotationStore((s) => s.strokeWidth)
  const rawStrokes = useAnnotationStore((s) => s.pages[pageKey])
  const strokes = useMemo(() => rawStrokes || [], [rawStrokes])
  const setTool = useAnnotationStore((s) => s.setTool)
  const setColor = useAnnotationStore((s) => s.setColor)
  const setStrokeWidth = useAnnotationStore((s) => s.setStrokeWidth)
  const undo = useAnnotationStore((s) => s.undo)
  const clearPage = useAnnotationStore((s) => s.clearPage)

  const palette = tool === 'highlighter' ? HIGHLIGHTER_COLORS : PEN_COLORS

  const switchTool = (newTool: AnnotationTool) => {
    if (newTool === 'highlighter' && !HIGHLIGHTER_COLORS.some((c) => c.value === color)) {
      setColor(HIGHLIGHTER_COLORS[0].value)
    } else if (newTool === 'pen' && !PEN_COLORS.some((c) => c.value === color)) {
      setColor(PEN_COLORS[0].value)
    }
    setTool(newTool)
  }

  return (
    <div className="annotation-toolbar">
      <div className="annotation-toolbar-group">
        <button
          className={`annotation-tool-btn${tool === 'pen' ? ' annotation-tool-btn--active' : ''}`}
          onClick={() => switchTool('pen')}
          title="Stift"
        >
          <Pen size={18} />
        </button>
        <button
          className={`annotation-tool-btn${tool === 'highlighter' ? ' annotation-tool-btn--active' : ''}`}
          onClick={() => switchTool('highlighter')}
          title="Textmarker"
        >
          <Highlighter size={18} />
        </button>
        <button
          className={`annotation-tool-btn${tool === 'eraser' ? ' annotation-tool-btn--active' : ''}`}
          onClick={() => switchTool('eraser')}
          title="Radierer"
        >
          <Eraser size={18} />
        </button>
        <button
          className={`annotation-tool-btn${tool === 'move' ? ' annotation-tool-btn--active' : ''}`}
          onClick={() => switchTool('move')}
          title="Markierung verschieben"
        >
          <Hand size={18} />
        </button>
      </div>

      {(tool === 'pen' || tool === 'highlighter') && (
        <div className="annotation-toolbar-group annotation-colors">
          {palette.map((c) => (
            <button
              key={c.value}
              className={`annotation-color-btn${color === c.value ? ' annotation-color-btn--active' : ''}`}
              style={{ backgroundColor: c.value }}
              onClick={() => setColor(c.value)}
              title={c.label}
            />
          ))}
        </div>
      )}

      {(tool === 'pen' || tool === 'highlighter') && (
        <div className="annotation-toolbar-group annotation-widths">
          {WIDTHS.map((w) => (
            <button
              key={w.value}
              className={`annotation-width-btn${strokeWidth === w.value ? ' annotation-width-btn--active' : ''}`}
              onClick={() => setStrokeWidth(w.value)}
              title={w.label}
            >
              <span
                className="annotation-width-dot"
                style={{ width: w.value + 4, height: w.value + 4 }}
              />
            </button>
          ))}
        </div>
      )}

      <div className="annotation-toolbar-group">
        <button
          className="annotation-tool-btn"
          onClick={() => undo(pageKey)}
          disabled={strokes.length === 0}
          title="Rueckgaengig"
        >
          <Undo2 size={18} />
        </button>
        <button
          className="annotation-tool-btn annotation-tool-btn--danger"
          onClick={() => clearPage(pageKey)}
          disabled={strokes.length === 0}
          title="Seite loeschen"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  )
}
