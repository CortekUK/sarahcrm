'use client'

import { useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActiveToggleProps {
  active: boolean
  /** Async setter — return value not used; throw to indicate failure so the
   *  optimistic update reverts. */
  onChange: (next: boolean) => Promise<void> | void
  activeLabel?: string
  inactiveLabel?: string
  disabled?: boolean
  className?: string
}

// Inline toggle pill used in admin list tables. Optimistically flips
// immediately, shows a tiny spinner while the supabase write is in flight,
// and reverts on error so the UI doesn't drift from server state.
export function ActiveToggle({
  active,
  onChange,
  activeLabel = 'Active',
  inactiveLabel = 'Inactive',
  disabled,
  className,
}: ActiveToggleProps) {
  const [optimistic, setOptimistic] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false)
  const value = optimistic ?? active

  async function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (disabled || pending) return
    const next = !value
    setOptimistic(next)
    setPending(true)
    try {
      await onChange(next)
    } catch {
      setOptimistic(active)
    } finally {
      setPending(false)
      setOptimistic(null)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || pending}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-[0.1em] transition-colors',
        value
          ? 'bg-[rgba(91,123,106,0.12)] text-accent hover:bg-[rgba(91,123,106,0.2)]'
          : 'bg-surface-2 text-text-dim hover:bg-surface-3',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      aria-pressed={value}
    >
      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          value ? 'bg-accent' : 'bg-text-dim',
        )}
      />
      {pending ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : value ? (
        <span className="flex items-center gap-1">
          <Check className="w-2.5 h-2.5" /> {activeLabel}
        </span>
      ) : (
        <span>{inactiveLabel}</span>
      )}
    </button>
  )
}
