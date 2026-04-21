import { useCallback, useRef, useEffect, type ChangeEvent, type RefObject } from 'react'
import './SyntaxTextarea.css'

interface SyntaxTextareaProps {
  value: string
  onChange: (value: string) => void
  /** Optional: externer Ref auf das Textarea (fuer Cursor-Operationen von aussen). */
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  /** Optional: Click-Handler — feuert NACH dem Browser-Default (Cursor gesetzt). */
  onClick?: () => void
  /** Optional: Cursor-Style override (z.B. fuer "click-to-place"-Modus). */
  cursorStyle?: string
}

const TAG_RE = /(\[[^\]\n]+\])|(\{v:[^{}\n]+\})|(\{[^{}\n]+\})/g

function highlight(source: string): string {
  let out = ''
  let last = 0
  const re = new RegExp(TAG_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    out += escHtml(source.slice(last, m.index))
    const [matched, chord, vocal, directive] = m
    let cls = 'syn-directive'
    if (chord) cls = 'syn-chord'
    else if (vocal) cls = 'syn-vocal'
    else if (!directive) {
      // defensive: should not happen (one of the three groups always matches)
      out += escHtml(matched)
      last = m.index + matched.length
      continue
    }
    out += `<span class="${cls}" data-tag-start="${m.index}">${escHtml(matched)}</span>`
    last = m.index + matched.length
  }
  out += escHtml(source.slice(last))
  return out
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function SyntaxTextarea({
  value,
  onChange,
  textareaRef: externalRef,
  onClick,
  cursorStyle,
}: SyntaxTextareaProps) {
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
        onClick={onClick}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        style={cursorStyle ? { cursor: cursorStyle } : undefined}
      />
    </div>
  )
}
