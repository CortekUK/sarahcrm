import { cn } from '@/lib/utils'

// Oversized italic pull quote — the editorial heavyweight. One bronze
// hairline above, one bronze hairline below. Attribution sits as a
// quiet small-caps line beneath.
//
// Use sparingly — Annabel's pulls a quote once per page at most, and
// only when the words can carry the weight. If you find yourself
// reaching for a pull quote three times on the same page, the page
// needs a re-edit, not more typography.

interface PullQuoteProps {
  children: React.ReactNode
  attribution?: string
  attributionDetail?: string
  align?: 'left' | 'center'
  size?: 'md' | 'lg' | 'xl'
  className?: string
}

export function PullQuote({
  children,
  attribution,
  attributionDetail,
  align = 'center',
  size = 'lg',
  className,
}: PullQuoteProps) {
  const sizeClass = {
    md: 'text-[clamp(1.25rem,2vw,1.625rem)]',
    lg: 'text-[clamp(1.625rem,3vw,2.5rem)]',
    xl: 'text-[clamp(2rem,4vw,3.25rem)]',
  }[size]

  return (
    <figure
      className={cn(
        'relative max-w-3xl py-12',
        align === 'center' ? 'mx-auto text-center' : 'text-left',
        className,
      )}
    >
      <span
        className={cn(
          'block h-px bg-bronze/45',
          align === 'center' ? 'w-24 mx-auto' : 'w-24',
        )}
      />

      <blockquote
        className={cn(
          'mt-10 mb-10 font-[family-name:var(--font-editorial)] italic font-light text-ivory leading-[1.35]',
          sizeClass,
        )}
      >
        <span aria-hidden className="text-bronze/40 mr-1 not-italic">“</span>
        {children}
        <span aria-hidden className="text-bronze/40 ml-1 not-italic">”</span>
      </blockquote>

      {attribution && (
        <figcaption
          className={cn(
            'font-[family-name:var(--font-meta)] uppercase tracking-[0.32em] text-[11px] font-medium text-bronze-light',
            align === 'center' ? 'text-center' : 'text-left',
          )}
        >
          {attribution}
          {attributionDetail && (
            <span className="ml-3 normal-case tracking-[0.2em] text-slate-haze">
              {attributionDetail}
            </span>
          )}
        </figcaption>
      )}

      <span
        className={cn(
          'block h-px bg-bronze/45 mt-6',
          align === 'center' ? 'w-24 mx-auto' : 'w-24',
        )}
      />
    </figure>
  )
}
