'use client'

// Inline status / system notes and labelled separators, after shadcn's
// June-2026 Marker: variant 'default' (inline note), 'border' (note with a
// hairline under it), 'separator' (centred label between rules — date breaks).

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { dayLabel } from './format'

type MarkerVariant = 'default' | 'border' | 'separator'

export function Marker({
  variant = 'default',
  children,
  className,
  role,
  'aria-label': ariaLabel,
}: {
  variant?: MarkerVariant
  children?: ReactNode
  className?: string
  role?: string
  'aria-label'?: string
}) {
  if (variant === 'separator') {
    return (
      <div role={role ?? 'separator'} aria-label={ariaLabel} className={cn('my-3 flex items-center gap-3', className)}>
        <span className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-1.5">{children}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    )
  }
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={cn(
        'mx-auto my-1.5 flex max-w-[85%] items-center justify-center gap-1.5 text-center text-xs text-text-dim',
        variant === 'border' && 'border-b border-border pb-2',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function MarkerIcon({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('flex shrink-0 items-center text-gold [&_svg]:size-3.5', className)} aria-hidden>{children}</span>
}

export function MarkerContent({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('leading-snug', className)}>{children}</span>
}

/** "Today" / "Yesterday" / "Tuesday 14 October" break between days. */
export function DateMarker({ date }: { date: string | Date }) {
  return (
    <Marker variant="separator">
      <MarkerContent className="font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.18em] text-text-dim">
        {dayLabel(date)}
      </MarkerContent>
    </Marker>
  )
}
