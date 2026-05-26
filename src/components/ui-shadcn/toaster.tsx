'use client'

import { useToast } from '@/lib/hooks/use-toast'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

// Night-themed toast surface — graphite panel with bronze hairline +
// bronze corner accent on the left. Destructive variant swaps to a
// quiet rose tint instead of the old high-contrast solid warm-orange.

export function Toaster() {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => {
        const destructive = toast.variant === 'destructive'
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto relative overflow-hidden rounded-md border shadow-[0_20px_40px_-12px_rgba(0,0,0,0.6)] p-4 pr-10 animate-in fade-in slide-in-from-bottom-4 backdrop-blur-sm',
              destructive
                ? 'bg-rose-950/90 border-rose-700/55 text-rose-100'
                : 'bg-graphite/95 border-graphite-line/65 text-ivory',
            )}
          >
            {/* Left accent stripe — bronze on default, rose on destructive */}
            <span
              aria-hidden
              className={cn(
                'absolute left-0 top-0 bottom-0 w-[3px]',
                destructive ? 'bg-rose-400' : 'bg-bronze',
              )}
            />
            {toast.title && (
              <div
                className={cn(
                  'font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.22em]',
                  destructive ? 'text-rose-200' : 'text-bronze-light',
                )}
              >
                {toast.title}
              </div>
            )}
            {toast.description && (
              <div
                className={cn(
                  'font-[family-name:var(--font-editorial)] text-[13.5px] leading-[1.6] mt-1.5',
                  destructive ? 'text-rose-100/90' : 'text-ivory-soft',
                )}
              >
                {toast.description}
              </div>
            )}
            <button
              onClick={() => dismiss(toast.id)}
              className={cn(
                'absolute top-2.5 right-2.5 p-1 rounded transition-colors',
                destructive
                  ? 'text-rose-200/70 hover:text-rose-100 hover:bg-rose-900/40'
                  : 'text-ivory-soft/65 hover:text-bronze-light hover:bg-bronze/[0.08]',
              )}
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
