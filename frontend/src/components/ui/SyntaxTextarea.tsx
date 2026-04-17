import { useCallback, useRef, type ChangeEvent } from 'react'
import './SyntaxTextarea.css'

interface SyntaxTextareaProps {
  value: string
  onChange: (value: string) => void
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

export function SyntaxTextarea({ value, onChange }: SyntaxTextareaProps) {
  const backdropRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const syncScroll = useCallback(() => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft
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
        ref={textareaRef}
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
