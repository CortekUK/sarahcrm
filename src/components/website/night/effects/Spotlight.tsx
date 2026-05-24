'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

// Mouse-following bronze halo. Drop this inside a relative container
// and it tracks the cursor over that container — used on hero
// sections, the apply close, and the gallery hero to make the cursor
// feel intentional.
//
// Disabled on touch devices (no hover) so it doesn't waste paint.

interface SpotlightProps {
  /** Halo size in pixels. Default 600. */
  size?: number
  /** Halo colour. Defaults to bronze-light at low alpha. */
  color?: string
  className?: string
}

export function Spotlight({ size = 600, color, className }: SpotlightProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const parent = el.parentElement
    if (!parent) return
    // Skip on touch devices
    if (window.matchMedia('(hover: none)').matches) return

    function onMove(e: MouseEvent) {
      if (!el || !parent) return
      const rect = parent.getBoundingClientRect()
      el.style.setProperty('--x', `${e.clientX - rect.left}px`)
      el.style.setProperty('--y', `${e.clientY - rect.top}px`)
      el.style.opacity = '1'
    }
    function onLeave() {
      if (!el) return
      el.style.opacity = '0'
    }

    parent.addEventListener('mousemove', onMove)
    parent.addEventListener('mouseleave', onLeave)
    return () => {
      parent.removeEventListener('mousemove', onMove)
      parent.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500',
        className,
      )}
      style={{
        background: `radial-gradient(${size}px circle at var(--x, 50%) var(--y, 50%), ${
          color ?? 'rgba(192, 152, 112, 0.18)'
        }, transparent 70%)`,
      }}
    />
  )
}
