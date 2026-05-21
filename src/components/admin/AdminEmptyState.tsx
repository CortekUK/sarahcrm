'use client'

import { type ComponentType, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AdminEmptyStateProps {
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

// Premium empty state — used when an admin section has zero rows. Single
// gold-tinted circular icon, headline, helper copy, and an optional CTA
// button. Consistent across all 7 website-control pages.
export function AdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: AdminEmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6 py-16',
        className,
      )}
    >
      <div className="w-14 h-14 rounded-full bg-gold-muted flex items-center justify-center mb-4 ring-1 ring-gold/15">
        <Icon size={22} strokeWidth={1.5} className="text-gold" />
      </div>
      <h3 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-text-muted mt-1.5 max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
