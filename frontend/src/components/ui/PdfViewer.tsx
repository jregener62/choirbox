import { Download, Upload, Trash2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore.ts'
import { usePdfStore } from '@/hooks/usePdf.ts'
import { useRef } from 'react'
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

  return (
    <div className="pdf-panel">
      <div className="pdf-toolbar">
        <span className="pdf-toolbar-name">{info.original_name}</span>
        <div className="pdf-toolbar-actions">
          {canUpload && !info.is_ref && (
            <>
              <button className="pdf-toolbar-btn" onClick={() => fileInputRef.current?.click()} title="PDF ersetzen">
                <Upload size={16} />
              </button>
              <button className="pdf-toolbar-btn" onClick={() => remove(dropboxPath)} title="PDF loeschen" style={{ color: 'var(--danger)' }}>
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
    </div>
  )
}
