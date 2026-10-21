'use client'

// "Sarah is typing…" row with three softly bouncing gold dots.

import { cn } from '@/lib/utils'

function label(names: string[]) {
  const first = (n: string) => n.split(' ')[0] || n
  if (names.length === 1) return `${first(names[0])} is typing`
  if (names.length === 2) return `${first(names[0])} and ${first(names[1])} are typing`
  return 'Several people are typing'
}

export function TypingIndicator({ names, className }: { names: string[]; className?: string }) {
  if (names.length === 0) return null
  return (
    <div role="status" aria-live="polite" className={cn('flex items-center gap-2 px-1 py-1 text-xs text-text-dim', className)}>
      <span className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold/70"
            style={{ animationDelay: `${i * 150}ms`, animationDuration: '1s' }}
          />
        ))}
      </span>
      <span>{label(names)}…</span>
    </div>
  )
}
