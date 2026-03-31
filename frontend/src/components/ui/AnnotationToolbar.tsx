import { Pen, Highlighter, Eraser, Undo2, Trash2 } from 'lucide-react'
import { useAnnotationStore } from '@/hooks/useAnnotations.ts'

const COLORS = [
  { value: '#ef4444', label: 'Rot' },
  { value: '#3b82f6', label: 'Blau' },
  { value: '#22c55e', label: 'Gruen' },
  { value: '#eab308', label: 'Gelb' },
  { value: '#a855f7', label: 'Lila' },
  { value: '#1e1e1e', label: 'Schwarz' },
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
  const strokes = useAnnotationStore((s) => s.pages[pageKey] || [])
  const setTool = useAnnotationStore((s) => s.setTool)
  const setColor = useAnnotationStore((s) => s.setColor)
  const setStrokeWidth = useAnnotationStore((s) => s.setStrokeWidth)
  const undo = useAnnotationStore((s) => s.undo)
  const clearPage = useAnnotationStore((s) => s.clearPage)

  return (
    <div className="annotation-toolbar">
      <div className="annotation-toolbar-group">
        <button
          className={`annotation-tool-btn${tool === 'pen' ? ' annotation-tool-btn--active' : ''}`}
          onClick={() => setTool('pen')}
          title="Stift"
        >
          <Pen size={18} />
        </button>
        <button
          className={`annotation-tool-btn${tool === 'highlighter' ? ' annotation-tool-btn--active' : ''}`}
          onClick={() => setTool('highlighter')}
          title="Textmarker"
        >
          <Highlighter size={18} />
        </button>
        <button
          className={`annotation-tool-btn${tool === 'eraser' ? ' annotation-tool-btn--active' : ''}`}
          onClick={() => setTool('eraser')}
          title="Radierer"
        >
          <Eraser size={18} />
        </button>
      </div>

      <div className="annotation-toolbar-group annotation-colors">
        {COLORS.map((c) => (
          <button
            key={c.value}
            className={`annotation-color-btn${color === c.value ? ' annotation-color-btn--active' : ''}`}
            style={{ backgroundColor: c.value }}
            onClick={() => setColor(c.value)}
            title={c.label}
          />
        ))}
      </div>

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
