'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Button } from '@/components/ui/Button'
import { AlertTriangle, HelpCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Replacement for window.confirm(). Renders a brand-styled modal and
// resolves to true/false based on which button the user clicks.
//
// Usage:
//   const confirm = useConfirm()
//   if (!(await confirm({ title: 'Delete this?', tone: 'danger' }))) return
//
// Mount <ConfirmDialogProvider> once at the layout root; calling the hook
// from anywhere inside it just works.

export type ConfirmTone = 'danger' | 'warning' | 'neutral'

export interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm must be used inside <ConfirmDialogProvider>')
  }
  return ctx
}

interface PendingState {
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null)
  // Track whether the user already chose so backdrop / unmount can't
  // double-resolve the promise.
  const resolvedRef = useRef(false)

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise((resolve) => {
      resolvedRef.current = false
      setPending({ options, resolve })
    })
  }, [])

  const settle = useCallback((value: boolean) => {
    setPending((curr) => {
      if (curr && !resolvedRef.current) {
        resolvedRef.current = true
        curr.resolve(value)
      }
      return null
    })
  }, [])

  // Escape-to-cancel — only when the dialog is open.
  useEffect(() => {
    if (!pending) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        settle(false)
      } else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        settle(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pending, settle])

  // Lock body scroll while open
  useEffect(() => {
    if (!pending) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [pending])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog pending={pending} onSettle={settle} />
    </ConfirmContext.Provider>
  )
}

function ConfirmDialog({
  pending,
  onSettle,
}: {
  pending: PendingState | null
  onSettle: (value: boolean) => void
}) {
  if (!pending) return null
  const { options } = pending
  const tone = options.tone ?? 'neutral'

  // Icon + colour per tone — gold for warnings, accent-warm for danger,
  // text-muted helper-blue for neutral asks. Keeps the dialog branded
  // rather than browser-grey.
  const toneStyles = {
    danger: {
      iconBg: 'bg-[rgba(196,105,74,0.12)]',
      iconColor: 'text-accent-warm',
      Icon: Trash2,
      btnVariant: 'danger' as const,
    },
    warning: {
      iconBg: 'bg-gold-muted',
      iconColor: 'text-gold-dark',
      Icon: AlertTriangle,
      btnVariant: 'primary' as const,
    },
    neutral: {
      iconBg: 'bg-surface-3',
      iconColor: 'text-text-muted',
      Icon: HelpCircle,
      btnVariant: 'primary' as const,
    },
  }[tone]

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      {/* Backdrop — click to cancel */}
      <div
        className="absolute inset-0 bg-[rgba(28,25,23,0.55)] backdrop-blur-[2px] animate-in fade-in duration-150"
        onClick={() => onSettle(false)}
      />
      {/* Dialog card */}
      <div
        className={cn(
          'relative w-full max-w-md bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-xl)]',
          'p-6 animate-in fade-in-0 zoom-in-95 duration-200',
        )}
      >
        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
              toneStyles.iconBg,
            )}
          >
            <toneStyles.Icon size={18} strokeWidth={1.8} className={toneStyles.iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="confirm-title"
              className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text leading-snug"
            >
              {options.title}
            </h2>
            {options.description && (
              <div className="text-sm text-text-muted mt-2 leading-relaxed">
                {options.description}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={() => onSettle(false)}>
            {options.cancelLabel ?? 'Cancel'}
          </Button>
          <Button variant={toneStyles.btnVariant} onClick={() => onSettle(true)}>
            {options.confirmLabel ?? (tone === 'danger' ? 'Delete' : 'Continue')}
          </Button>
        </div>
      </div>
    </div>
  )
}
