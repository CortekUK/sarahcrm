'use client'

// Warm-luxury chat surface for the WhatsApp inbox thread. Hand-authored (this
// repo uses a bespoke UI kit, not the shadcn CLI — there is no components.json,
// so `npx shadcn add bubble` would have no registry/config to write into and
// would clash with the kit's theming). API mirrors shadcn's June-2026 chat
// primitives (MessageScroller / Message / Bubble) but styled to the gold/ivory
// palette + DM Sans: outbound = gold-tinted, right-aligned; inbound = ivory
// muted surface, left-aligned.

import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Side = 'inbound' | 'outbound'

// Scroll container that keeps the latest message in view. Re-pins to the bottom
// whenever `pin` changes (pass the message count / last id).
export function MessageScroller({
  children,
  pin,
  className,
}: {
  children: ReactNode
  pin?: unknown
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [pin])
  return (
    <div
      ref={ref}
      className={cn('flex-1 min-h-0 overflow-y-auto px-6 py-5', className)}
    >
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

// A single message row — aligns its bubble to the correct edge.
export function Message({ side, children }: { side: Side; children: ReactNode }) {
  return (
    <div className={cn('flex w-full', side === 'outbound' ? 'justify-end' : 'justify-start')}>
      {children}
    </div>
  )
}

// The message surface. `footer` holds the timestamp + delivery status.
export function Bubble({
  side,
  children,
  footer,
}: {
  side: Side
  children: ReactNode
  footer?: ReactNode
}) {
  const outbound = side === 'outbound'
  return (
    <div
      className={cn(
        'max-w-[78%] rounded-[var(--radius-lg)] px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
        'font-[family-name:var(--font-body)] whitespace-pre-wrap break-words',
        outbound
          ? 'bg-gold-muted text-text border border-gold/25 rounded-br-sm'
          : 'bg-surface-2 text-text border border-border rounded-bl-sm',
      )}
    >
      <div>{children}</div>
      {footer && (
        <div
          className={cn(
            'mt-1 flex items-center gap-1 text-[11px] tabular-nums',
            outbound ? 'justify-end text-bronze' : 'text-text-dim',
          )}
        >
          {footer}
        </div>
      )}
    </div>
  )
}
