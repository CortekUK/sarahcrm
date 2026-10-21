'use client'

// Message surface after shadcn's June-2026 Bubble, in the gold/ivory brand:
// mine = gold-tinted (end), theirs = ivory/muted (start). `position` squares
// the corners that touch neighbouring bubbles in a group so a run reads as
// one block. Legacy props (`side`, `footer`) render the original WhatsApp
// bubble exactly as before.

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { resolveAlign, useMessageAlign, type ChatAlign, type ChatSide } from './Message'

export type BubbleVariant =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'tinted'
  | 'outline'
  | 'ghost'
  | 'destructive'

export type BubblePosition = 'single' | 'first' | 'middle' | 'last'

const variantStyles: Record<BubbleVariant, string> = {
  default: 'bg-gold text-white border border-gold',
  // Chat tokens come from `.chat-theme` (globals.css); fallbacks keep the
  // kit usable outside it.
  tinted:
    'bg-[var(--chat-bubble-mine,color-mix(in_srgb,var(--color-gold)_14%,var(--color-surface)))] text-text border border-[var(--chat-bubble-mine-border,var(--color-border-gold))]',
  secondary: 'bg-[var(--chat-bubble-theirs,var(--color-surface-2))] text-text border border-border',
  muted: 'bg-surface-3 text-text-muted border border-transparent',
  outline: 'bg-surface text-text border border-border',
  ghost: 'bg-transparent text-text border border-transparent',
  destructive: 'bg-accent-warm/10 text-text border border-accent-warm/35',
}

function cornerClasses(align: ChatAlign, position: BubblePosition) {
  const end = align === 'end'
  const tail = end ? 'rounded-br-sm' : 'rounded-bl-sm'
  const top = end ? 'rounded-tr-sm' : 'rounded-tl-sm'
  return cn(tail, (position === 'middle' || position === 'last') && top)
}

export function Bubble({
  side,
  align,
  variant,
  position = 'single',
  footer,
  children,
  className,
}: {
  /** @deprecated legacy alias — use `align` + `variant` */
  side?: ChatSide
  align?: ChatAlign
  variant?: BubbleVariant
  position?: BubblePosition
  /** Legacy inline footer (timestamp + status) */
  footer?: ReactNode
  children: ReactNode
  className?: string
}) {
  const ctxAlign = useMessageAlign()

  // Legacy rendering — unchanged markup for the WhatsApp inbox.
  if (side) {
    const outbound = side === 'outbound'
    return (
      <div
        className={cn(
          'max-w-[78%] rounded-[var(--radius-lg)] px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
          'font-[family-name:var(--font-body)] whitespace-pre-wrap break-words',
          outbound
            ? 'bg-gold-muted text-text border border-gold/25 rounded-br-sm'
            : 'bg-surface-2 text-text border border-border rounded-bl-sm',
          className,
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

  const a = resolveAlign(align ?? ctxAlign)
  const v = variant ?? (a === 'end' ? 'tinted' : 'secondary')
  return (
    <div
      data-variant={v}
      className={cn(
        'relative max-w-full overflow-hidden rounded-[var(--radius-lg)] text-sm leading-relaxed',
        'font-[family-name:var(--font-body)]',
        v !== 'ghost' && 'shadow-[var(--shadow-sm)]',
        variantStyles[v],
        cornerClasses(a, position),
        className,
      )}
    >
      {children}
      {footer && <div className="px-3.5 pb-2 -mt-1 text-[11px] text-text-dim">{footer}</div>}
    </div>
  )
}

export function BubbleContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('px-3.5 py-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]', className)}>
      {children}
    </div>
  )
}

export function BubbleGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-0.5', className)}>{children}</div>
}

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?'")\]])/g

/** Plain text with http(s) links made clickable (new tab, no referrer). */
export function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_RE)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline decoration-gold/50 underline-offset-2 hover:decoration-gold"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}
