'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/providers/ThemeProvider'
import { cn } from '@/lib/utils'

// Day/night toggle. Two variants:
//   - "pill" (default) — outlined pill with the inactive icon, sits
//     comfortably next to the Apply / Member Login pair in the public
//     header and the portal's right-side cluster.
//   - "icon" — bare icon button, for the admin sidebar footer where
//     space is tight.

interface ThemeToggleProps {
  variant?: 'pill' | 'icon'
  className?: string
}

export function ThemeToggle({ variant = 'pill', className }: ThemeToggleProps) {
  const { theme, toggle, isHydrating } = useTheme()
  const isDay = theme === 'day'
  const label = isDay ? 'Switch to night mode' : 'Switch to day mode'
  const Icon = isDay ? Moon : Sun

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        title={label}
        suppressHydrationWarning
        className={cn(
          'inline-flex items-center justify-center w-9 h-9 rounded-full text-[var(--color-ivory-soft)] hover:text-[var(--color-bronze-light)] hover:bg-[var(--color-bronze)]/[0.08] transition-colors',
          isHydrating && 'opacity-70',
          className,
        )}
      >
        <Icon size={15} strokeWidth={1.5} />
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      suppressHydrationWarning
      className={cn(
        'inline-flex items-center gap-2 px-3.5 py-2.5 rounded-full border border-[var(--color-graphite-line)] hover:border-[var(--color-bronze)]/55 text-[var(--color-ivory-soft)] hover:text-[var(--color-bronze-light)] hover:bg-[var(--color-bronze)]/[0.06] transition-all duration-300',
        isHydrating && 'opacity-70',
        className,
      )}
    >
      <Icon size={13} strokeWidth={1.5} />
      <span className="sr-only">{label}</span>
    </button>
  )
}
