import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({ open, onClose, children, title, size = 'md', className }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[rgba(44,40,37,0.4)]"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
    >
      {/* Panel — capped to viewport, content scrolls inside */}
      <div
        className={cn(
          'relative w-full bg-surface rounded-[var(--radius-xl)] shadow-xl',
          'animate-[modal-enter_0.2s_ease-out]',
          'flex flex-col max-h-[calc(100vh-2rem)]',
          sizeStyles[size],
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {title && (
          <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-border rounded-t-[var(--radius-xl)]">
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-[var(--radius-md)] text-text-dim hover:text-text hover:bg-surface-2 transition-colors"
            >
              <X size={18} strokeWidth={1.5} />
            </button>
          </div>
        )}

        {/* Close button when no title */}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-1.5 rounded-[var(--radius-md)] text-text-dim hover:text-text hover:bg-surface-2 transition-colors"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        )}

        {/* Scrollable content */}
        <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">{children}</div>
      </div>
    </div>
  )
}
