'use client'

// Filter row + pill chip used across the directory (members tags, contact sectors).

import { cn } from '@/lib/utils'

export function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      <span className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light/85 mr-2">
        {label}
      </span>
      {children}
    </div>
  )
}

export function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      aria-pressed={active}
      className={cn(
        'max-w-full truncate px-3.5 py-1.5 text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-[0.22em] rounded-full border transition-all duration-300',
        active
          ? 'border-bronze bg-bronze/15 text-bronze-light day:text-bronze-dark'
          : 'border-graphite-line/55 bg-graphite/30 text-ivory/75 hover:border-bronze/55 hover:text-bronze-light day:border-stone-300 day:bg-stone-100 day:text-stone-600 day:hover:text-bronze-dark',
      )}
    >
      {label}
    </button>
  )
}
