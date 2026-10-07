'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { Button } from './Button'

// Long text clamped to a few lines with a small "Show more / Show less" toggle
// (house ghost Button). The toggle only appears when the text actually
// overflows the clamp — measured on mount and whenever the box resizes (e.g. a
// drawer opening at 400px vs full width) — so short text renders plainly.
//
// `lines` maps to Tailwind's line-clamp-* utilities (2–6 supported).

interface ClampedTextProps {
  text: string
  lines?: 2 | 3 | 4 | 5 | 6
  className?: string
}

const CLAMP: Record<NonNullable<ClampedTextProps['lines']>, string> = {
  2: 'line-clamp-2',
  3: 'line-clamp-3',
  4: 'line-clamp-4',
  5: 'line-clamp-5',
  6: 'line-clamp-6',
}

export function ClampedText({ text, lines = 3, className }: ClampedTextProps) {
  const ref = useRef<HTMLParagraphElement>(null)
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
  }, [text, lines, expanded])

  return (
    <div className="min-w-0">
      <p
        ref={ref}
        className={cn(
          'text-sm text-text leading-relaxed whitespace-pre-line break-words',
          !expanded && CLAMP[lines],
          className,
        )}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 -ml-3 text-gold hover:text-gold-dark"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </div>
  )
}
