import { useEditor, EditorContent, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, Strikethrough, Underline as UnderlineIcon,
  Heading3, MessageSquareQuote, Pilcrow,
  X, Check,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/api/client.ts'
import { parseRtf } from '@/utils/rtfParser'
import { rtfToTiptap } from '@/utils/rtfToTiptap'
import { serializeTiptapToRtf, type TiptapDoc } from '@/utils/rtfSerializer'

interface RtfEditorProps {
  docId: number
  originalName: string
  onSaved: () => void
  onCancel: () => void
}

export function RtfEditor({ docId, originalName, onSaved, onCancel }: RtfEditorProps) {
  const [initialRtf, setInitialRtf] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await api<{ content: string }>(`/documents/${docId}/content`)
        if (!cancelled) setInitialRtf(data.content)
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'RTF konnte nicht geladen werden')
      }
    }
    load()
    return () => { cancelled = true }
  }, [docId])

  const initialDoc = useMemo<JSONContent | null>(() => {
    if (initialRtf === null) return null
    try {
      return rtfToTiptap(parseRtf(initialRtf)) as JSONContent
    } catch {
      return { type: 'doc', content: [{ type: 'paragraph' }] } as JSONContent
    }
  }, [initialRtf])

  const [dirty, setDirty] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Placeholder.configure({ placeholder: 'Text eingeben…' }),
    ],
    content: initialDoc ?? '',
    onUpdate: () => setDirty(true),
  }, [initialDoc])

  if (loadError) {
    return (
      <div className="pdf-upload">
        <div className="pdf-upload-text" style={{ color: 'var(--danger)' }}>{loadError}</div>
      </div>
    )
  }

  if (initialRtf === null || !editor) {
    return (
      <div className="pdf-upload">
        <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>Editor lädt…</span>
      </div>
    )
  }

  const handleSave = async () => {
    setSaveError(null)
    setSaving(true)
    try {
      const doc = editor.getJSON() as unknown as TiptapDoc
      const rtf = serializeTiptapToRtf(doc)
      await api(`/documents/${docId}/content`, {
        method: 'PUT',
        body: { content: rtf },
      })
      onSaved()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (dirty && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return
    onCancel()
  }

  const insertComment = () => {
    const { from, to, empty } = editor.state.selection
    if (empty) {
      editor.chain().focus().insertContent('[[  ]]').run()
      // Cursor zwischen die Klammern setzen (3 Zeichen rueckwaerts).
      const pos = editor.state.selection.from - 3
      editor.chain().focus().setTextSelection(pos).run()
    } else {
      const text = editor.state.doc.textBetween(from, to, ' ')
      editor.chain().focus().insertContentAt({ from, to }, `[[ ${text} ]]`).run()
    }
  }

  const insertBarMarker = () => {
    editor.chain().focus().insertContent('| ').run()
  }

  const toggleSection = () => {
    editor.chain().focus().toggleHeading({ level: 3 }).run()
  }

  const bActive = editor.isActive('bold')
  const iActive = editor.isActive('italic')
  const uActive = editor.isActive('underline')
  const sActive = editor.isActive('strike')
  const hActive = editor.isActive('heading', { level: 3 })

  return (
    <div className="rtf-editor">
      <div className="rtf-editor-bar">
        <span className="rtf-editor-name">{originalName}</span>
        <div className="rtf-editor-actions">
          <button
            type="button"
            className={`rtf-editor-btn${bActive ? ' rtf-editor-btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Fett (Ctrl+B)"
          >
            <Bold size={16} />
          </button>
          <button
            type="button"
            className={`rtf-editor-btn${iActive ? ' rtf-editor-btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Kursiv (Ctrl+I)"
          >
            <Italic size={16} />
          </button>
          <button
            type="button"
            className={`rtf-editor-btn${uActive ? ' rtf-editor-btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Unterstrichen"
          >
            <UnderlineIcon size={16} />
          </button>
          <button
            type="button"
            className={`rtf-editor-btn${sActive ? ' rtf-editor-btn--active' : ''}`}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Durchgestrichen"
          >
            <Strikethrough size={16} />
          </button>
          <div className="rtf-editor-sep" />
          <button
            type="button"
            className={`rtf-editor-btn${hActive ? ' rtf-editor-btn--active' : ''}`}
            onClick={toggleSection}
            title="Abschnitt (H3)"
          >
            <Heading3 size={16} />
          </button>
          <button
            type="button"
            className="rtf-editor-btn"
            onClick={insertBarMarker}
            title="Taktanfang (|) — fuegt an Cursor-Position ein"
          >
            <Pilcrow size={16} />
          </button>
          <button
            type="button"
            className="rtf-editor-btn"
            onClick={insertComment}
            title="Kommentar [[ ]]"
          >
            <MessageSquareQuote size={16} />
          </button>
          <div className="rtf-editor-sep" />
          <button
            type="button"
            className="rtf-editor-btn"
            onClick={handleCancel}
            title="Abbrechen"
          >
            <X size={16} />
          </button>
          <button
            type="button"
            className="rtf-editor-btn rtf-editor-btn--save"
            onClick={handleSave}
            disabled={saving || !dirty}
            title={dirty ? 'Speichern' : 'Keine Änderungen'}
          >
            <Check size={16} />
          </button>
        </div>
      </div>
      {saveError && <div className="rtf-editor-error">{saveError}</div>}
      <EditorContent editor={editor} className="rtf-editor-content" />
    </div>
  )
}
