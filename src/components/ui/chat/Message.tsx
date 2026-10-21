'use client'

// Conversation row primitives after shadcn's June-2026 Message:
//   Message (align start|end) › MessageAvatar + MessageContent
//     (MessageHeader › Bubble › MessageFooter); MessageGroup stacks a run of
//   consecutive messages from one sender. The legacy `side` prop
//   ('inbound' | 'outbound') still works for the WhatsApp inbox.

import { createContext, useContext, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ChatSide = 'inbound' | 'outbound'
export type ChatAlign = 'start' | 'end'

const AlignContext = createContext<ChatAlign>('start')
export const useMessageAlign = () => useContext(AlignContext)

export function resolveAlign(align?: ChatAlign, side?: ChatSide): ChatAlign {
  if (align) return align
  return side === 'outbound' ? 'end' : 'start'
}

export function Message({
  side,
  align,
  children,
  className,
}: {
  /** @deprecated legacy alias — use `align` */
  side?: ChatSide
  align?: ChatAlign
  children: ReactNode
  className?: string
}) {
  const a = resolveAlign(align, side)
  return (
    <AlignContext.Provider value={a}>
      <div
        data-align={a}
        className={cn(
          'flex w-full items-end gap-2',
          // row-reverse puts the avatar on the right; justify-start then packs right.
          a === 'end' ? 'flex-row-reverse justify-start' : 'justify-start',
          className,
        )}
      >
        {children}
      </div>
    </AlignContext.Provider>
  )
}

export function MessageGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-0.5', className)}>{children}</div>
}

// Avatar slot, bottom-aligned. `spacer` keeps the column width for grouped
// rows that don't repeat the avatar; `offsetFooter` lifts it level with the
// bubble when a footer sits underneath.
export function MessageAvatar({
  children,
  spacer,
  offsetFooter,
  className,
}: {
  children?: ReactNode
  spacer?: boolean
  offsetFooter?: boolean
  className?: string
}) {
  return (
    <div className={cn('w-8 shrink-0 self-end', offsetFooter && 'mb-5', className)} aria-hidden={spacer}>
      {spacer ? null : children}
    </div>
  )
}

export function MessageContent({ children, className }: { children: ReactNode; className?: string }) {
  const a = useMessageAlign()
  return (
    <div
      className={cn(
        'flex min-w-0 max-w-[80%] flex-col gap-1 md:max-w-[65%]',
        a === 'end' ? 'items-end' : 'items-start',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function MessageHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'self-start px-1 font-[family-name:var(--font-label)] text-[10.5px] font-medium tracking-[0.04em] text-text-muted',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function MessageFooter({ children, className }: { children: ReactNode; className?: string }) {
  const a = useMessageAlign()
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-1 text-[11px] tabular-nums text-text-dim',
        a === 'end' ? 'justify-end self-end' : 'self-start',
        className,
      )}
    >
      {children}
    </div>
  )
}
