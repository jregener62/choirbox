import { Node } from '@tiptap/core'

/** Tiptap-Block-Node fuer manuelle Seitenumbrueche.
 *  - Renderer: <hr data-page-break class="rtf-editor-page-break" />
 *  - Serializer (rtfSerializer): \page
 *  - Parser (rtfParser): \page → leere Paragraph mit pageBreak: true → Node hier */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'hr[data-page-break]' }]
  },

  renderHTML() {
    return ['hr', { 'data-page-break': '', class: 'rtf-editor-page-break' }]
  },
})
