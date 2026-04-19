import { useCallback, useRef, useEffect, type ChangeEvent, type RefObject } from 'react'
import './SyntaxTextarea.css'

interface SyntaxTextareaProps {
  value: string
  onChange: (value: string) => void
  /** Optional: externer Ref auf das Textarea (fuer Cursor-Operationen von aussen). */
  textareaRef?: RefObject<HTMLTextAreaElement | null>
}

const TAG_RE = /(\[[^\]]+\])|(\{v:[^{}]+\})|(\{[^{}]+\})/g

function highlight(source: string): string {
  return source.replace(TAG_RE, (match, chord, vocal, directive) => {
    if (chord) return `<span class="syn-chord">${escHtml(chord)}</span>`
    if (vocal) return `<span class="syn-vocal">${escHtml(vocal)}</span>`
    if (directive) return `<span class="syn-directive">${escHtml(directive)}</span>`
    return escHtml(match)
  })
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function SyntaxTextarea({ value, onChange, textareaRef: externalRef }: SyntaxTextareaProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const internalRef = useRef<HTMLTextAreaElement>(null)

  // Externer Ref wird per Effekt gespiegelt, damit wir intern mit einem
  // stabilen Ref arbeiten (fuers Scroll-Sync) und trotzdem dem Parent
  // Cursor-Zugriff geben koennen.
  useEffect(() => {
    if (externalRef) {
      (externalRef as { current: HTMLTextAreaElement | null }).current = internalRef.current
    }
  })

  const syncScroll = useCallback(() => {
    if (backdropRef.current && internalRef.current) {
      backdropRef.current.scrollTop = internalRef.current.scrollTop
      backdropRef.current.scrollLeft = internalRef.current.scrollLeft
    }
  }, [])

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value)
  }

  const highlighted = highlight(value) + '\n'

  return (
    <div className="syntax-textarea-wrap">
      <div
        ref={backdropRef}
        className="syntax-textarea-backdrop"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
      <textarea
        ref={internalRef}
        className="syntax-textarea"
        value={value}
        onChange={handleChange}
        onScroll={syncScroll}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
    </div>
  )
}
