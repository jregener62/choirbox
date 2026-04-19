import { ClipboardPaste, Music, FileUp, FileText, ChevronRight } from 'lucide-react'
import { Modal } from './Modal'
import './UploadChoiceModal.css'

interface UploadChoiceModalProps {
  onClose: () => void
  onPasteText: () => void
  onPasteChord: () => void
  onNewRtf: () => void
  onPickFile: () => void
}

/**
 * Three-way choice for adding content to a song folder:
 * 1. Text einfuegen → opens PasteTextModal in "txt" mode
 * 2. Chordsheet einfuegen → opens PasteTextModal in "cho" mode
 * 3. Datei auswaehlen → triggers the existing file picker
 */
export function UploadChoiceModal({
  onClose,
  onPasteText,
  onPasteChord,
  onNewRtf,
  onPickFile,
}: UploadChoiceModalProps) {
  return (
    <Modal title="Hinzufuegen" onClose={onClose}>
      <div className="upload-choice-list">
        <button
          className="upload-choice"
          onClick={() => {
            onClose()
            onPasteText()
          }}
        >
          <div className="upload-choice-icon upload-choice-icon--text">
            <ClipboardPaste size={20} />
          </div>
          <div className="upload-choice-info">
            <div className="upload-choice-label">Text einfuegen</div>
            <div className="upload-choice-desc">Songtext aus Zwischenablage einfuegen</div>
          </div>
          <ChevronRight size={18} className="upload-choice-arrow" />
        </button>

        <button
          className="upload-choice"
          onClick={() => {
            onClose()
            onPasteChord()
          }}
        >
          <div className="upload-choice-icon upload-choice-icon--chord">
            <Music size={20} />
          </div>
          <div className="upload-choice-info">
            <div className="upload-choice-label">Chordsheet einfuegen</div>
            <div className="upload-choice-desc">Akkord-Text aus Zwischenablage einfuegen</div>
          </div>
          <ChevronRight size={18} className="upload-choice-arrow" />
        </button>

        <button
          className="upload-choice"
          onClick={() => {
            onClose()
            onNewRtf()
          }}
        >
          <div className="upload-choice-icon upload-choice-icon--text">
            <FileText size={20} />
          </div>
          <div className="upload-choice-info">
            <div className="upload-choice-label">Neuer Rich-Text</div>
            <div className="upload-choice-desc">Leere .rtf anlegen und direkt im Editor bearbeiten</div>
          </div>
          <ChevronRight size={18} className="upload-choice-arrow" />
        </button>

        <div className="upload-choice-divider" />

        <button
          className="upload-choice"
          onClick={() => {
            onClose()
            onPickFile()
          }}
        >
          <div className="upload-choice-icon upload-choice-icon--file">
            <FileUp size={20} />
          </div>
          <div className="upload-choice-info">
            <div className="upload-choice-label">Datei auswaehlen</div>
            <div className="upload-choice-desc">Audio, PDF oder Textdatei hochladen</div>
          </div>
          <ChevronRight size={18} className="upload-choice-arrow" />
        </button>
      </div>
    </Modal>
  )
}
