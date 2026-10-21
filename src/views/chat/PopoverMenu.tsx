'use client'

// Minimal anchored action menu (the house kit has no dropdown primitive).
// Closes on outside click, Escape, or picking an item.

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface MenuItem {
  key: string
  label: string
  icon?: ComponentType<{ size?: number; className?: string }>
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

export function PopoverMenu({
  items,
  trigger,
  label,
  align = 'end',
  className,
  triggerClassName,
}: {
  items: MenuItem[]
  trigger: ReactNode
  label: string
  align?: 'start' | 'end'
  className?: string
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (items.length === 0) return null

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text',
          open && 'bg-surface-2 text-text',
          triggerClassName,
        )}
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-[calc(100%+6px)] z-30 min-w-[200px] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface py-1 shadow-[var(--shadow-lg)]',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] transition-colors disabled:opacity-40',
                item.danger
                  ? 'text-accent-warm hover:bg-accent-warm/[0.08]'
                  : 'text-text hover:bg-surface-2',
              )}
            >
              {item.icon && <item.icon size={14} className="shrink-0 opacity-80" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
