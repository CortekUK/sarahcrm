import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { KenBurnsImage } from '@/components/website/night/primitives/MediaBlocks'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { cn } from '@/lib/utils'

// Presentational building blocks shared by the PITCH, London Series,
// Partner With Us and Concierge pages — the night design vocabulary
// (bronze small-caps eyebrows, display serif headings, editorial italic
// ledes, hairline cards). Server-safe: no hooks, so server pages render
// them directly. Theme tokens only (day mode remaps ink/ivory/graphite).

export const eyebrowClass =
  'font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light'
export const ledeClass =
  'font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.1875rem)] leading-[1.7] text-ivory-soft'
export const bodyClass = 'text-[15px] leading-[1.75] text-ivory-soft'

// ── Hero ─────────────────────────────────────────────────────────────
export function NightHero({
  image,
  alt,
  eyebrow,
  title,
  lede,
  children,
  topSlot,
  tall,
}: {
  image: string
  alt: string
  eyebrow?: string
  title: React.ReactNode
  lede?: React.ReactNode
  /** Buttons row. */
  children?: React.ReactNode
  /** Above the eyebrow (e.g. a wordmark). */
  topSlot?: React.ReactNode
  tall?: boolean
}) {
  return (
    <section
      className={cn(
        'relative w-full always-night overflow-hidden bg-ink',
        tall ? 'min-h-[88vh]' : 'min-h-[70vh]',
      )}
    >
      <KenBurnsImage src={image} alt={alt} motion="in" duration={32} overlay={0.58} className="absolute inset-0" priority />
      <div className="absolute inset-x-0 bottom-0 h-[55%] hero-fade-bottom pointer-events-none" />
      <div
        className={cn(
          'relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 flex flex-col justify-end pt-36 pb-20',
          tall ? 'min-h-[88vh]' : 'min-h-[70vh]',
        )}
      >
        {topSlot && (
          <Reveal type="up" delay={0}>
            <div className="mb-8">{topSlot}</div>
          </Reveal>
        )}
        {eyebrow && (
          <Reveal type="up" delay={0}>
            <p className={cn(eyebrowClass, 'mb-6')}>{eyebrow}</p>
          </Reveal>
        )}
        <Reveal type="clip" delay={150}>
          <h1
            className={cn(
              'max-w-5xl',
              // Long quoted heroes (PITCH, Concierge) step down a size.
              typeof title === 'string' && title.length > 60 ? 'display-md' : 'display-lg',
            )}
          >
            {title}
          </h1>
        </Reveal>
        {lede && (
          <Reveal type="up" delay={400}>
            <div className={cn(ledeClass, 'mt-6 max-w-2xl')}>{lede}</div>
          </Reveal>
        )}
        {children && (
          <Reveal type="up" delay={550}>
            <div className="mt-10 flex flex-wrap gap-3 sm:gap-4">{children}</div>
          </Reveal>
        )}
      </div>
    </section>
  )
}

// ── Section heading ─────────────────────────────────────────────────
export function SectionHead({
  eyebrow,
  title,
  lede,
  align = 'left',
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  lede?: React.ReactNode
  align?: 'left' | 'center'
  className?: string
}) {
  return (
    <div className={cn('mb-12 md:mb-16', align === 'center' && 'text-center mx-auto', 'max-w-3xl', className)}>
      {eyebrow && (
        <Reveal type="up" delay={0}>
          <p className={cn(eyebrowClass, 'mb-5')}>{eyebrow}</p>
        </Reveal>
      )}
      <Reveal type="clip" delay={120}>
        <h2 className="display-md">{title}</h2>
      </Reveal>
      {lede && (
        <Reveal type="up" delay={260}>
          <div className={cn(ledeClass, 'mt-6')}>{lede}</div>
        </Reveal>
      )}
    </div>
  )
}

// ── Stat tiles ──────────────────────────────────────────────────────
export function StatGrid({
  items,
  className,
}: {
  items: { figure: string; label: string }[]
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 sm:grid-cols-2 gap-px bg-graphite-line/50 border border-graphite-line/50',
        items.length >= 3 && 'lg:grid-cols-3',
        items.length === 4 && 'lg:grid-cols-4',
        className,
      )}
    >
      {items.map((s, i) => (
        <Reveal key={s.label} type="up" delay={i * 90}>
          <div className="bg-ink h-full p-8 lg:p-10">
            <p className="font-[family-name:var(--font-display)] text-[clamp(2.75rem,5vw,4.25rem)] leading-none text-bronze-light">
              {s.figure}
            </p>
            <p className="mt-5 text-[14.5px] leading-relaxed text-ivory-soft max-w-[18rem]">{s.label}</p>
          </div>
        </Reveal>
      ))}
    </div>
  )
}

// ── Numbered / titled cards ─────────────────────────────────────────
export interface CardItem {
  n?: string
  title: string
  body?: React.ReactNode
  image?: string
  imageAlt?: string
  href?: string
  id?: string
}

export function CardGrid({
  items,
  cols = 3,
  className,
}: {
  items: CardItem[]
  cols?: 2 | 3 | 4 | 5
  className?: string
}) {
  const colClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-5',
  }[cols]
  return (
    <div className={cn('grid grid-cols-1 gap-5 lg:gap-6', colClass, className)}>
      {items.map((it, i) => {
        const inner = (
          <div
            id={it.id}
            className={cn(
              'group h-full border border-graphite-line/60 bg-graphite/40 day:bg-white day:shadow-sm flex flex-col transition-colors duration-500 scroll-mt-28',
              it.href && 'hover:border-bronze/60',
            )}
          >
            {it.image && (
              <div className="relative aspect-[4/3] overflow-hidden">
                <Image
                  src={it.image}
                  alt={it.imageAlt ?? it.title}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition-transform duration-[1.6s] group-hover:scale-[1.04]"
                />
              </div>
            )}
            <div className="p-6 lg:p-7 flex-1 flex flex-col">
              {it.n && (
                <p className="font-[family-name:var(--font-meta)] text-[11px] tracking-[0.25em] text-bronze-light tabular-nums mb-4">
                  {it.n}
                </p>
              )}
              <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.25rem,1.6vw,1.5rem)] leading-tight text-ivory">
                {it.title}
              </h3>
              {it.body && <div className="mt-3 text-[14px] leading-[1.7] text-ivory-soft">{it.body}</div>}
              {it.href && (
                <span className="mt-auto pt-6 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-bronze-light">
                  Read more <ArrowUpRight size={12} strokeWidth={1.5} />
                </span>
              )}
            </div>
          </div>
        )
        return (
          <Reveal key={it.title + i} type="up" delay={(i % 4) * 90}>
            {it.href ? (
              <Link href={it.href} className="block h-full">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </Reveal>
        )
      })}
    </div>
  )
}

// ── Pricing tiers ───────────────────────────────────────────────────
export interface Tier {
  name: string
  price: string
  note?: string
  items?: string[]
  featured?: boolean
}

export function TierCards({ tiers, footnote }: { tiers: Tier[]; footnote?: React.ReactNode }) {
  return (
    <>
      <div
        className={cn(
          'grid grid-cols-1 gap-5 lg:gap-6',
          tiers.length === 2 && 'md:grid-cols-2',
          tiers.length >= 3 && 'md:grid-cols-3',
        )}
      >
        {tiers.map((t, i) => (
          <Reveal key={t.name} type="up" delay={i * 100}>
            <div
              className={cn(
                'h-full border p-7 lg:p-9 flex flex-col day:bg-white day:shadow-sm',
                t.featured ? 'border-bronze/70 bg-bronze/[0.06]' : 'border-graphite-line/60 bg-graphite/40',
              )}
            >
              <p className={eyebrowClass}>{t.name}</p>
              <p className="mt-5 font-[family-name:var(--font-display)] text-[clamp(1.75rem,3vw,2.5rem)] leading-tight text-ivory">
                {t.price}
              </p>
              {t.note && (
                <p className="mt-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-haze">
                  {t.note}
                </p>
              )}
              {t.items && t.items.length > 0 && (
                <ul className="mt-7 pt-7 border-t border-graphite-line/60 space-y-3">
                  {t.items.map((x) => (
                    <li key={x} className="flex gap-3 text-[14px] leading-relaxed text-ivory-soft">
                      <span aria-hidden className="mt-[0.6em] h-px w-3 shrink-0 bg-bronze/70" />
                      {x}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Reveal>
        ))}
      </div>
      {footnote && (
        <Reveal type="up" delay={200}>
          <p className="mt-8 text-[13px] leading-relaxed text-slate-haze max-w-3xl">{footnote}</p>
        </Reveal>
      )}
    </>
  )
}

// ── Table (scrolls inside its own box on phones) ─────────────────────
export function SimpleTable({
  head,
  rows,
  caption,
  firstColStrong = true,
}: {
  head: string[]
  rows: React.ReactNode[][]
  caption?: React.ReactNode
  firstColStrong?: boolean
}) {
  return (
    <Reveal type="up" delay={0}>
      <div className="overflow-x-auto border border-graphite-line/60">
        <table className="w-full min-w-[560px] text-left">
          <thead>
            <tr className="border-b border-graphite-line/60 bg-graphite/50">
              {head.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-5 py-4 font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.28em] text-bronze-light"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-graphite-line/40 last:border-b-0">
                {r.map((c, j) => (
                  <td
                    key={j}
                    className={cn(
                      'px-5 py-4 align-top text-[14px] leading-relaxed',
                      j === 0 && firstColStrong ? 'text-ivory' : 'text-ivory-soft',
                    )}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption && <p className="mt-4 text-[13px] leading-relaxed text-slate-haze">{caption}</p>}
    </Reveal>
  )
}

// ── Bulleted list with bronze rules ─────────────────────────────────
export function RuleList({ items, className }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ul className={cn('space-y-3.5', className)}>
      {items.map((x, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-ivory-soft">
          <span aria-hidden className="mt-[0.7em] h-px w-4 shrink-0 bg-bronze/70" />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Form panel (anchor target around a SiteForm) ────────────────
export function FormPanel({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id: string
  eyebrow: string
  title: React.ReactNode
  lede?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-28 w-full max-w-4xl mx-auto border border-graphite-line/60 bg-graphite/30 day:bg-white day:shadow-sm p-6 sm:p-10 lg:p-12">
      <p className={cn(eyebrowClass, 'mb-5')}>{eyebrow}</p>
      <h3 className="display-sm">{title}</h3>
      {lede && <div className={cn(ledeClass, 'mt-4 mb-10 !text-[16px]')}>{lede}</div>}
      {!lede && <div className="mb-10" />}
      {children}
    </div>
  )
}
