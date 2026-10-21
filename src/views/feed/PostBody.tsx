'use client'

// Post text: linkified, line breaks kept, clamped to ~6 lines with "See
// more" when (and only when) it actually overflows. Long URLs wrap anywhere
// so a post can never force horizontal scroll on a phone.

import { useEffect, useRef, useState } from 'react'
import type { ChatPerson } from '@/lib/chat/contract'
import { RichText } from './RichText'
import { cn } from '@/lib/utils'

export function PostBody({
  text,
  mentions,
  className,
  lines = 6,
}: {
  text: string
  mentions?: ChatPerson[]
  className?: string
  lines?: 4 | 6
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || expanded) return
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, expanded])

  if (!text) return null
  return (
    <div className={cn('min-w-0', className)}>
      <div
        ref={ref}
        className={cn(
          'whitespace-pre-line text-[15px] leading-relaxed text-text [overflow-wrap:anywhere]',
          !expanded && (lines === 6 ? 'line-clamp-6' : 'line-clamp-4'),
        )}
      >
        <RichText text={text} mentions={mentions} />
      </div>
      {overflows && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-0.5 inline-flex min-h-10 items-center text-sm font-medium text-gold hover:text-gold-dark"
        >
          See more
        </button>
      )}
    </div>
  )
}
