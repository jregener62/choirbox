import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '@/stores/appStore'
import { usePlayerStore } from '@/stores/playerStore'

interface ModalProps {
  title?: string
  onClose: () => void
  closeOnOverlay?: boolean
  showClose?: boolean
  children: ReactNode
}

export function Modal({
  title,
  onClose,
  closeOnOverlay = true,
  showClose = true,
  children,
}: ModalProps) {
  const setModalOpen = useAppStore((s) => s.setModalOpen)

  useEffect(() => {
    setModalOpen(true)
    usePlayerStore.getState().setPlaying(false)
    return () => setModalOpen(false)
  }, [setModalOpen])

  return (
    <div
      className="modal-overlay"
      onClick={closeOnOverlay ? onClose : undefined}
    >
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="modal-header">
            <span className="modal-title">{title}</span>
            {showClose && (
              <button className="btn-icon" onClick={onClose}>
                <X size={20} />
              </button>
            )}
          </div>
        )}
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  )
}
