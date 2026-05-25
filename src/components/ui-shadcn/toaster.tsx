'use client'

import { useToast } from '@/lib/hooks/use-toast'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Toaster() {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto rounded-lg border shadow-lg p-4 pr-10 relative animate-in fade-in slide-in-from-bottom-4',
            toast.variant === 'destructive'
              ? 'bg-[var(--color-accent-warm)] border-[var(--color-accent-warm)] text-white'
              : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]',
          )}
        >
          {toast.title && <div className="font-medium text-sm">{toast.title}</div>}
          {toast.description && (
            <div className="text-sm opacity-80 mt-0.5">{toast.description}</div>
          )}
          <button
            onClick={() => dismiss(toast.id)}
            className="absolute top-2 right-2 opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
