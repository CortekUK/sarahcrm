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

  // Tone palette — bronze for warnings, rose for danger, graphite for
  // neutral. Each tone also drives the confirm button's accent colour
  // so the call-to-action matches the icon.
  const toneStyles = {
    danger: {
      iconBg: 'border-rose-700/55 bg-rose-900/25',
      iconColor: 'text-rose-300',
      cornerColor: 'bg-rose-500/55',
      confirmClass:
        'border-rose-700 bg-rose-900/40 text-rose-200 hover:bg-rose-800/60 hover:text-rose-100',
      Icon: Trash2,
    },
    warning: {
      iconBg: 'border-bronze/55 bg-bronze/15',
      iconColor: 'text-bronze-light',
      cornerColor: 'bg-bronze/65',
      confirmClass:
        'border-bronze bg-bronze/20 text-bronze-light hover:bg-bronze hover:text-ink',
      Icon: AlertTriangle,
    },
    neutral: {
      iconBg: 'border-graphite-line/65 bg-graphite-2/55',
      iconColor: 'text-ivory-soft',
      cornerColor: 'bg-bronze/55',
      confirmClass:
        'border-bronze bg-bronze/20 text-bronze-light hover:bg-bronze hover:text-ink',
      Icon: HelpCircle,
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
        className="absolute inset-0 bg-ink/75 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => onSettle(false)}
      />
      {/* Dialog card — graphite panel with bronze corner brackets,
          matching PortalModal so dialogs across the product feel like
          a matched set. */}
      <div
        className={cn(
          'relative w-full max-w-md bg-graphite border border-bronze/35 shadow-[0_30px_60px_-12px_rgba(0,0,0,0.7)]',
          'p-7 animate-in fade-in-0 zoom-in-95 duration-200',
        )}
      >
        <span
          aria-hidden
          className={cn('absolute top-3 left-3 w-5 h-px', toneStyles.cornerColor)}
        />
        <span
          aria-hidden
          className={cn('absolute top-3 left-3 w-px h-5', toneStyles.cornerColor)}
        />
        <span
          aria-hidden
          className={cn('absolute bottom-3 right-3 w-5 h-px', toneStyles.cornerColor)}
        />
        <span
          aria-hidden
          className={cn('absolute bottom-3 right-3 w-px h-5', toneStyles.cornerColor)}
        />

        <div className="flex items-start gap-4">
          <div
            className={cn(
              'flex-shrink-0 w-10 h-10 rounded-full border flex items-center justify-center',
              toneStyles.iconBg,
            )}
          >
            <toneStyles.Icon size={17} strokeWidth={1.6} className={toneStyles.iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="confirm-title"
              className="font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.5vw,1.3125rem)] text-ivory leading-tight"
            >
              {options.title}
            </h2>
            {options.description && (
              <div className="font-[family-name:var(--font-editorial)] italic text-[13.5px] text-ivory-soft mt-2.5 leading-[1.65]">
                {options.description}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 mt-7">
          <button
            type="button"
            onClick={() => onSettle(false)}
            className="px-5 py-2.5 rounded-full border border-graphite-line/70 bg-transparent text-ivory-soft hover:border-bronze/55 hover:text-bronze-light hover:bg-bronze/[0.06] font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.28em] transition-all duration-300"
          >
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => onSettle(true)}
            className={cn(
              'px-5 py-2.5 rounded-full border font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.28em] transition-all duration-300',
              toneStyles.confirmClass,
            )}
          >
            {options.confirmLabel ?? (tone === 'danger' ? 'Delete' : 'Continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
