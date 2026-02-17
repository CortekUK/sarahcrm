import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type BadgeVariant = 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  dot?: boolean
}

const variantStyles: Record<BadgeVariant, string> = {
  active: 'text-accent bg-[rgba(91,123,106,0.1)]',
  upcoming: 'text-gold bg-[rgba(184,151,90,0.1)]',
  draft: 'text-text-dim bg-[rgba(160,154,147,0.1)]',
  urgent: 'text-accent-warm bg-[rgba(196,105,74,0.1)]',
  info: 'text-accent-blue bg-[rgba(90,123,150,0.1)]',
}

const dotColours: Record<BadgeVariant, string> = {
  active: 'bg-accent',
  upcoming: 'bg-gold',
  draft: 'bg-text-dim',
  urgent: 'bg-accent-warm',
  info: 'bg-accent-blue',
}

export function Badge({
  variant = 'draft',
  dot = false,
  children,
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5',
        'font-[family-name:var(--font-label)] text-[0.625rem] font-medium uppercase tracking-[0.15em]',
        'rounded-full',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotColours[variant])}
        />
      )}
      {children}
    </span>
  )
}
