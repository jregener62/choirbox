import { Download, Upload, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import { usePdfStore } from '@/hooks/usePdf.ts'
import { useRef, useState } from 'react'
import type { PdfInfo } from '@/types/index.ts'

interface PdfViewerProps {
  dropboxPath: string
  info: PdfInfo
  canUpload: boolean
}

export function PdfViewer({ dropboxPath, info, canUpload }: PdfViewerProps) {
  const token = useAuthStore((s) => s.token)
  const { upload, remove } = usePdfStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const pdfUrl = `/api/pdf/download?path=${encodeURIComponent(dropboxPath)}&token=${token}`

  const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await upload(dropboxPath, file)
    } catch {
      // Error handled by store
    }
    e.target.value = ''
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await remove(dropboxPath)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="pdf-panel">
      <div className="pdf-toolbar">
        <span className="pdf-toolbar-name">{info.original_name}</span>
        <div className="pdf-toolbar-actions">
          {canUpload && (
            <>
              <button className="pdf-toolbar-btn" onClick={() => fileInputRef.current?.click()} title="PDF ersetzen">
                <Upload size={16} />
              </button>
              <button className="pdf-toolbar-btn" onClick={() => setConfirmDelete(true)} title="PDF loeschen" style={{ color: 'var(--danger)' }}>
                <Trash2 size={16} />
              </button>
            </>
          )}
          <a href={pdfUrl} download={info.original_name ?? 'document.pdf'} className="pdf-toolbar-btn" title="Download">
            <Download size={16} />
          </a>
        </div>
      </div>
      <iframe
        className="pdf-iframe"
        src={pdfUrl}
        title="PDF Dokument"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        style={{ display: 'none' }}
        onChange={handleReplace}
      />
      {confirmDelete && (
        <div className="confirm-overlay" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title">PDF loeschen?</p>
            <p className="confirm-filename">{info.original_name}</p>
            <p className="confirm-hint">Wird unwiderruflich aus der Dropbox geloescht.</p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Abbrechen
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Loeschen...' : 'Loeschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
