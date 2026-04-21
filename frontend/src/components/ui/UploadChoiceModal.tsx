import { Music, FileUp, FileText, ChevronRight } from 'lucide-react'
import { Modal } from './Modal'
import './UploadChoiceModal.css'

interface UploadChoiceModalProps {
  onClose: () => void
  onNewCho: () => void
  onNewRtf: () => void
  onPickFile: () => void
}

/**
 * Auswahl fuer "Hinzufuegen":
 * 1. Neues Chordsheet → legt leere .cho an und oeffnet den SheetEditor
 * 2. Neuer Rich-Text  → legt leere .rtf an und oeffnet den RtfEditor
 * 3. Datei auswaehlen → File-Picker (Audio, PDF, Textdatei)
 */
export function UploadChoiceModal({
  onClose,
  onNewCho,
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
            onNewCho()
          }}
        >
          <div className="upload-choice-icon upload-choice-icon--chord">
            <Music size={20} />
          </div>
          <div className="upload-choice-info">
            <div className="upload-choice-label">Neues Chordsheet</div>
            <div className="upload-choice-desc">Leere .cho anlegen und direkt im Editor bearbeiten</div>
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
