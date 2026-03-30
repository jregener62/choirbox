import { useRef, useState } from 'react'
import { FileUp, Upload } from 'lucide-react'
import { usePdfStore } from '@/hooks/usePdf.ts'
import { PdfViewer } from '@/components/ui/PdfViewer.tsx'

interface PdfPanelProps {
  dropboxPath: string
  canUpload: boolean
}

export function PdfPanel({ dropboxPath, canUpload }: PdfPanelProps) {
  const { info, loading, uploading, upload } = usePdfStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    try {
      await upload(dropboxPath, file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen')
    }
    e.target.value = ''
  }

  if (loading) {
    return (
      <div className="pdf-upload">
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Lade...</span>
      </div>
    )
  }

  if (!info?.has_pdf) {
    return (
      <div className="pdf-upload">
        <div className="pdf-upload-icon">
          <FileUp size={24} />
        </div>
        {canUpload ? (
          <>
            <div className="pdf-upload-text">
              Noch kein Dokument hinterlegt.<br />
              PDF fuer dieses Stueck hochladen.
            </div>
            <button
              className="pdf-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload size={14} />
              {uploading ? 'Wird hochgeladen...' : 'PDF hochladen'}
            </button>
            <span className="pdf-upload-hint">Max. 10 MB</span>
            {error && (
              <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                {error}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
          </>
        ) : (
          <div className="pdf-upload-text">
            Kein Dokument hinterlegt.
          </div>
        )}
      </div>
    )
  }

  return <PdfViewer dropboxPath={dropboxPath} info={info} canUpload={canUpload} />
}
