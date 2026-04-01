import type { ReactNode } from 'react'

interface ConfirmDialogProps {
  title: string
  filename?: string
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
    <div className="confirm-overlay" onClick={() => !loading && onClose()}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-title">{title}</p>

        {filename && <p className="confirm-filename">{filename}</p>}
        {hint && <p className="confirm-hint">{hint}</p>}
        {children}

        <div className="confirm-actions" style={children ? { marginTop: 12 } : undefined}>
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
              'auth-submit'
            }
            style={variant === 'primary' ? { flex: 1 } : undefined}
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
          >
            {loading && confirmLoadingLabel ? confirmLoadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
