import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

// Server-rendered bronze double-stroke pill link — the same CTA pattern
// used across the public site (pure-CSS hover, no client JS). Shared by
// the Portfolio, Success Stories, Journal and Rewards pages.

export function Pill({
  href,
  children,
  variant = 'quiet',
  external = false,
}: {
  href: string
  children: React.ReactNode
  variant?: 'solid' | 'quiet'
  external?: boolean
}) {
  const inner = (
    <span className="block relative px-8 py-4 border border-bronze rounded-full overflow-hidden transition-colors duration-700">
      <span
        aria-hidden
        className="absolute inset-[5px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover:border-ink/20"
      />
      <span
        aria-hidden
        className={
          variant === 'solid'
            ? 'absolute inset-[5px] bg-bronze rounded-full scale-x-100 origin-center'
            : 'absolute inset-[5px] bg-bronze rounded-full scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-700 ease-out'
        }
      />
      <span
        className={
          variant === 'solid'
            ? 'relative z-10 flex items-center justify-center gap-3 font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.3em] text-ink'
            : 'relative z-10 flex items-center justify-center gap-3 font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.3em] text-ivory group-hover:text-ink transition-colors duration-700'
        }
      >
        {children}
        <ArrowUpRight
          size={14}
          strokeWidth={1.5}
          className="shrink-0 transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1"
        />
      </span>
    </span>
  )

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="group relative inline-block">
        {inner}
      </a>
    )
  }
  return (
    <Link href={href} className="group relative inline-block">
      {inner}
    </Link>
  )
}

/** Small-caps text link with an arrow — the quieter secondary action. */
export function MetaLink({
  href,
  children,
  external = false,
}: {
  href: string
  children: React.ReactNode
  external?: boolean
}) {
  const cls =
    'inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-500'
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
        <ArrowUpRight size={14} strokeWidth={1.5} />
      </a>
    )
  }
  return (
    <Link href={href} className={cls}>
      {children}
      <ArrowUpRight size={14} strokeWidth={1.5} />
    </Link>
  )
}

/** Eyebrow label + hairline rule, used to open each section. */
export function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-10 flex items-center gap-4 ${className}`}>
      <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light whitespace-nowrap">
        {children}
      </p>
      <span className="flex-1 h-px bg-bronze/40" />
    </div>
  )
}
