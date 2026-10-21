'use client'

// Red unread indicator: a dot, or a count that caps at "9+". Renders nothing
// at zero. `ring` adds a surface-coloured ring so it sits cleanly on an icon.

import { cn } from '@/lib/utils'

export function UnreadBadge({
  count,
  dot,
  max = 9,
  ring,
  muted,
  className,
}: {
  count: number
  dot?: boolean
  max?: number
  ring?: boolean
  /** muted conversation: neutral grey instead of red */
  muted?: boolean
  className?: string
}) {
  if (!count || count <= 0) return null
  const label = `${count} unread`
  if (dot) {
    return (
      <span
        role="status"
        aria-label={label}
        className={cn('block h-2.5 w-2.5 rounded-full bg-[#C8443A]', ring && 'ring-2 ring-surface', className)}
      />
    )
  }
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5',
        'text-[10px] font-semibold leading-none tabular-nums',
        muted ? 'bg-surface-3 text-text-muted' : 'bg-[#C8443A] text-white',
        ring && 'ring-2 ring-surface',
        className,
      )}
    >
      {count > max ? `${max}+` : count}
    </span>
  )
}
