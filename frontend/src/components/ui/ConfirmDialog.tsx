import type { ReactNode } from 'react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  title: string
  filename?: string | null
  hint?: string
  children?: ReactNode
  onClose: () => void
  confirmLabel: string
  confirmLoadingLabel?: string
  onConfirm: () => void
  loading?: boolean
  confirmDisabled?: boolean
  variant?: 'danger' | 'primary' | 'secondary'
  cancelLabel?: string | null
}

export function ConfirmDialog({
  title,
  filename,
  hint,
  children,
  onClose,
  confirmLabel,
  confirmLoadingLabel,
  onConfirm,
  loading = false,
  confirmDisabled = false,
  variant = 'danger',
  cancelLabel = 'Abbrechen',
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onClose} closeOnOverlay={!loading}>
      {filename && <p className="confirm-filename">{filename}</p>}
      {hint && <p className="confirm-hint">{hint}</p>}
      {children}

      <div className="confirm-actions" style={children ? { marginTop: 'var(--space-3)' } : undefined}>
        {cancelLabel !== null && (
          <button
            className="btn btn-secondary"
            onClick={onClose}
            disabled={loading}
          >
            {cancelLabel}
          </button>
        )}
        <button
          className={
            variant === 'danger' ? 'btn btn-danger' :
            variant === 'secondary' ? 'btn btn-secondary' :
            'btn btn-primary'
          }
          onClick={onConfirm}
          disabled={loading || confirmDisabled}
        >
          {loading && confirmLoadingLabel ? confirmLoadingLabel : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
