import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// The night design's bronze double-ring pill (same markup as the Events /
// Concierge pages), as a submit button and as a link. Server-safe (no
// hooks) so server pages can render PillLink directly.

function PillInner({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <span
      className={cn(
        'block relative border border-bronze rounded-full overflow-hidden transition-colors duration-700',
        small ? 'px-6 py-3' : 'px-8 py-3.5',
      )}
    >
      <span
        aria-hidden
        className="absolute inset-[5px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover:border-ink/20"
      />
      <span
        aria-hidden
        className="absolute inset-[5px] bg-bronze rounded-full scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-700 ease-out"
      />
      <span className="relative z-10 flex items-center justify-center gap-3 font-[family-name:var(--font-meta)] text-[10.5px] sm:text-[11px] font-medium uppercase tracking-[0.28em] sm:tracking-[0.32em] text-ivory group-hover:text-ink transition-colors duration-700">
        {children}
        <ArrowUpRight
          size={14}
          strokeWidth={1.5}
          className="shrink-0 transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1"
        />
      </span>
    </span>
  )
}

export function PillButton({
  children,
  type = 'button',
  disabled,
  onClick,
  small,
  className,
}: {
  children: React.ReactNode
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
  small?: boolean
  className?: string
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative inline-block transition-opacity duration-500',
        disabled && 'opacity-60 cursor-wait',
        className,
      )}
    >
      <PillInner small={small}>{children}</PillInner>
    </button>
  )
}

export function PillLink({
  href,
  children,
  small,
  className,
}: {
  href: string
  children: React.ReactNode
  small?: boolean
  className?: string
}) {
  return (
    <Link href={href} className={cn('group relative inline-block', className)}>
      <PillInner small={small}>{children}</PillInner>
    </Link>
  )
}

/** Quiet text link with the meta small-caps treatment. */
export function MetaLink({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300',
        className,
      )}
    >
      {children}
      <ArrowUpRight size={13} strokeWidth={1.5} />
    </Link>
  )
}
