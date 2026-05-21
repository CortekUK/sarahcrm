'use client'

import { type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface AdminPageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: BreadcrumbItem[]
  backHref?: string
  actions?: ReactNode
  meta?: ReactNode
  className?: string
}

// Consistent header for every admin page. Replaces the ad-hoc h1 + div
// patterns that varied subtly across the 7 website pages (different sizes,
// inconsistent action button placement, missing meta).
export function AdminPageHeader({
  title,
  description,
  breadcrumbs,
  backHref,
  actions,
  meta,
  className,
}: AdminPageHeaderProps) {
  const router = useRouter()
  return (
    <div className={cn('mb-7', className)}>
      {(breadcrumbs?.length || backHref) && (
        <div className="flex items-center gap-2 mb-3 text-xs text-text-dim">
          {backHref && (
            <button
              type="button"
              onClick={() => router.push(backHref)}
              className="inline-flex items-center gap-1 px-2 py-1 -ml-2 rounded hover:bg-surface-2 transition-colors text-text-muted hover:text-text"
            >
              <ChevronLeft size={13} />
              Back
            </button>
          )}
          {breadcrumbs?.map((b, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <span className="text-text-dim">/</span>}
              {b.href ? (
                <Link href={b.href} className="hover:text-text transition-colors">
                  {b.label}
                </Link>
              ) : (
                <span className="text-text">{b.label}</span>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text leading-tight">
            {title}
          </h1>
          {description && (
            <p className="text-sm text-text-muted mt-1.5 max-w-2xl leading-relaxed">
              {description}
            </p>
          )}
          {meta && <div className="mt-3 flex items-center gap-3">{meta}</div>}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  )
}
