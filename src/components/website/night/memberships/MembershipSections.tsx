import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────
// /memberships building blocks (rebuild per Sarah's brief, Nov 2026).
//
// Copy marked "verbatim" comes from the brief / the 2026–27 brochure and
// must not be reworded. Tier cards, comparison rows + footnote, benefit
// cards and category chips are DB-driven (see the page for the queries);
// the fixed brochure blocks live here.
// ─────────────────────────────────────────────────────────────────────

// ─── Shared bits ─────────────────────────────────────────────────────

export function SectionHead({
  eyebrow,
  title,
  lede,
  className,
}: {
  eyebrow: string
  title: string
  lede?: string
  className?: string
}) {
  return (
    <div className={cn('max-w-3xl mx-auto text-center mb-12 lg:mb-16', className)}>
      <Reveal type="up" delay={0}>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
          {eyebrow}
        </p>
      </Reveal>
      <Reveal type="clip" delay={150}>
        <h2 className="display-md">{title}</h2>
      </Reveal>
      {lede && (
        <Reveal type="up" delay={350}>
          <p className="mt-8 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.75] text-ivory-soft">
            {lede}
          </p>
        </Reveal>
      )}
    </div>
  )
}

export function PillLink({
  href,
  children,
  ariaLabel,
  className,
}: {
  href: string
  children: React.ReactNode
  ariaLabel?: string
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn('group relative inline-block self-start', className)}
    >
      <span className="block relative px-8 py-3.5 border border-bronze rounded-full overflow-hidden">
        <span
          aria-hidden
          className="absolute inset-[4px] bg-bronze rounded-full scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-700 ease-out"
        />
        <span className="relative z-10 flex items-center gap-3 font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.32em] text-ivory group-hover:text-ink transition-colors duration-700">
          {children}
          <ArrowUpRight
            size={14}
            strokeWidth={1.5}
            className="transition-transform duration-700 group-hover:translate-x-1 group-hover:-translate-y-1"
          />
        </span>
      </span>
    </Link>
  )
}

// ─── Membership & Professional Matchmaking intro (brochure) ─────────

const INTRO_POINTS = [
  {
    title: 'Onboarding',
    body: 'We map your revenue goals, ideal client, target sectors and strategic partners.',
  },
  {
    title: 'Due diligence',
    body: 'Business history, turnover and security checks on every applicant.',
  },
  {
    title: 'Introductions',
    body: 'Qualified one-to-one introductions every month, up to ten depending on tier.',
  },
  {
    title: 'Events & meetings',
    body: 'Relationships built at our luxury events or in private one-to-one meetings.',
  },
] as const

export function MatchmakingIntro() {
  return (
    <>
      <SectionHead
        eyebrow="Membership & Professional Matchmaking"
        title="The right person, introduced personally."
      />
      <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
        {INTRO_POINTS.map((p, i) => (
          <Reveal key={p.title} type="up" delay={i * 100} className="h-full">
            <div className="h-full pt-6 border-t border-bronze/45">
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] tabular-nums text-bronze/85">
                {String(i + 1).padStart(2, '0')}
              </p>
              <h3 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(1.25rem,1.6vw,1.5rem)] leading-[1.2] text-ivory">
                {p.title}
              </h3>
              <p className="mt-3 font-[family-name:var(--font-editorial)] text-[15px] leading-[1.7] text-ivory-soft">
                {p.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </>
  )
}

// ─── Tier cards ──────────────────────────────────────────────────────

export interface TierCardData {
  slug: string
  name: string
  headline: string
  audience: string
  /** e.g. "£2,500" */
  price: string
  /** e.g. "a year + VAT" */
  contract: string
  body: string
  image: string
  features: readonly string[]
}

export function TierCards({ tiers }: { tiers: readonly TierCardData[] }) {
  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
      {tiers.map((t, i) => (
        <Reveal key={t.slug} type="up" delay={i * 120} className="h-full">
          <article className="always-night h-full flex flex-col overflow-hidden border border-graphite-line/40 bg-ink hover:border-bronze/55 transition-colors duration-500">
            <div className="relative aspect-[16/10]">
              <Image src={t.image} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-b from-ink/15 via-ink/45 to-ink" />
              <div className="absolute inset-x-0 bottom-0 px-7 pb-5">
                <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2vw,1.875rem)] leading-[1.1] text-ivory">
                  {t.name}
                </h3>
              </div>
            </div>
            <div className="flex-1 flex flex-col px-7 pb-8 pt-2">
              {t.headline && (
                <p className="font-[family-name:var(--font-editorial)] italic text-[18px] leading-[1.4] text-bronze-light">
                  {t.headline}
                </p>
              )}
              {t.audience && (
                <p className="mt-3 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.24em] leading-[1.7] text-ivory-soft/80">
                  {t.audience}
                </p>
              )}
              <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
                <span className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,3vw,2.75rem)] leading-none text-ivory tabular-nums">
                  {t.price}
                </span>
                <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-ivory-soft/80">
                  {t.contract}
                </span>
              </p>
              <span className="block h-px w-12 bg-bronze/55 mt-6" />
              {t.body && (
                <p className="mt-6 font-[family-name:var(--font-editorial)] text-[15px] leading-[1.7] text-ivory-soft">
                  {t.body}
                </p>
              )}
              {t.features.length > 0 && (
                <ul className="mt-5 space-y-2">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-3">
                      <span aria-hidden className="mt-[8px] w-1 h-1 rounded-full bg-bronze shrink-0" />
                      <span className="font-[family-name:var(--font-editorial)] text-[14px] leading-[1.6] text-ivory-soft">
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-auto pt-8">
                <PillLink
                  href={`/membership-application?tier=${encodeURIComponent(t.slug)}`}
                  ariaLabel={`Apply for ${t.name}`}
                >
                  Apply
                </PillLink>
              </div>
            </div>
          </article>
        </Reveal>
      ))}
    </div>
  )
}

// ─── Comparison table ────────────────────────────────────────────────

export interface ComparisonRowData {
  label: string
  /** One cell per tier, in tier order. Text, or a boolean tick/dash. */
  cells: (string | boolean)[]
}

function Cell({ value }: { value: string | boolean }) {
  if (typeof value === 'string') {
    return <>{value}</>
  }
  return value ? (
    <span aria-label="Included" className="text-bronze-light">
      ✓
    </span>
  ) : (
    <span aria-label="Not included" className="text-slate-dim">
      —
    </span>
  )
}

export function ComparisonSpec({
  tierNames,
  rows,
  footnote,
}: {
  tierNames: readonly string[]
  rows: readonly ComparisonRowData[]
  footnote: string | null
}) {
  return (
    <div className="max-w-6xl mx-auto">
      {/* md+ — editorial spec sheet */}
      <table className="hidden md:table w-full text-left border-collapse table-fixed">
        <thead>
          <tr>
            <th className="w-[19%] pb-8 align-bottom" />
            {tierNames.map((name) => (
              <th key={name} className="pb-8 px-4 align-bottom">
                <p className="font-[family-name:var(--font-display)] text-[clamp(1rem,1.2vw,1.1875rem)] text-ivory leading-tight">
                  {name}
                </p>
                <span className="block h-px w-12 bg-bronze/65 mt-5" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.label}
              className={cn(
                'border-t border-graphite-line/40 align-top',
                i === rows.length - 1 && 'border-b',
              )}
            >
              <th
                scope="row"
                className="py-6 pr-4 font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.3em] text-bronze-light"
              >
                {row.label}
              </th>
              {row.cells.map((c, j) => (
                <td
                  key={j}
                  className="py-6 px-4 font-[family-name:var(--font-editorial)] text-[15.5px] leading-[1.6] text-ivory"
                >
                  <Cell value={c} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile — one block per row, tier name above each value */}
      <dl className="md:hidden border-t border-graphite-line/40">
        {rows.map((row) => (
          <div key={row.label} className="py-6 border-b border-graphite-line/40">
            <dt className="font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.3em] text-bronze-light mb-4">
              {row.label}
            </dt>
            {row.cells.map((c, j) => (
              <dd key={j} className="grid grid-cols-[minmax(0,40%)_1fr] gap-4 py-1.5">
                <span className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.2em] leading-[1.6] text-ivory-soft/75">
                  {tierNames[j]}
                </span>
                <span className="font-[family-name:var(--font-editorial)] text-[15px] leading-[1.55] text-ivory">
                  <Cell value={c} />
                </span>
              </dd>
            ))}
          </div>
        ))}
      </dl>

      {footnote && (
        <p className="mt-8 max-w-4xl font-[family-name:var(--font-editorial)] italic text-[14px] leading-[1.7] text-ivory-soft">
          {footnote}
        </p>
      )}
    </div>
  )
}

// ─── The Club Business Membership — one business per category ───────

export interface CategoryChip {
  name: string
  is_taken: boolean
}

// "What you receive" — brochure page "The Club Business Membership · £15,000 + VAT".
const BUSINESS_RECEIVES = [
  { k: 'Places', v: 'Four at every event, for your team or guests' },
  { k: 'Exclusivity', v: 'No other business member in your category for the year' },
  {
    k: 'Bespoke event',
    v: 'Managed and filled by The Club with an audience of prospects. Event costs additional, negotiated through our preferred suppliers',
  },
  { k: 'Preferred status', v: 'Priority introductions through the platform' },
  { k: 'Marketing', v: 'Campaigns built across our CRM' },
  { k: 'Benefits', v: 'Member discounts across retail, hospitality, travel and more, plus concierge' },
] as const

export function CategoryExclusivity({
  categories,
  applyHref,
  price,
}: {
  categories: readonly CategoryChip[]
  applyHref: string
  /** e.g. "£15,000" — from the tier_3 plan row. */
  price: string | null
}) {
  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
      <div className="lg:col-span-7">
        <Reveal type="up" delay={0}>
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
            The Club Business Membership{price ? ` · ${price} + VAT` : ''}
          </p>
        </Reveal>
        <Reveal type="clip" delay={150}>
          <h2 className="display-md">One business per category.</h2>
        </Reveal>
        <Reveal type="up" delay={300}>
          <p className="mt-8 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.75] text-ivory-soft">
            For owners and decision makers of businesses over £10m. For the year of your
            membership, no other business member shares your category, and your introductions
            come first.
          </p>
        </Reveal>

        {categories.length > 0 && (
          <Reveal type="up" delay={400}>
            <p className="mt-12 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.36em] text-ivory-soft/80 mb-5">
              Categories open to exclusivity
            </p>
            <ul className="flex flex-wrap gap-2.5">
              {categories.map((c) => (
                <li
                  key={c.name}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-4 py-2 font-[family-name:var(--font-editorial)] text-[14px] leading-none',
                    c.is_taken
                      ? 'border-graphite-line/50 text-slate-haze'
                      : 'border-bronze/50 text-ivory bg-bronze/[0.06]',
                  )}
                >
                  <span className={cn(c.is_taken && 'line-through decoration-slate-haze/60')}>
                    {c.name}
                  </span>
                  {c.is_taken && (
                    <span className="font-[family-name:var(--font-meta)] text-[8.5px] uppercase tracking-[0.28em] text-bronze/85">
                      Taken
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Reveal>
        )}

        <Reveal type="up" delay={500}>
          <div className="mt-12">
            <PillLink href={applyHref} ariaLabel="Apply for The Club Business Membership">
              Apply
            </PillLink>
          </div>
        </Reveal>
      </div>

      <div className="lg:col-span-5">
        <Reveal type="up" delay={200}>
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
            What you receive
          </p>
          <dl className="border-t border-graphite-line/40">
            {BUSINESS_RECEIVES.map((r) => (
              <div
                key={r.k}
                className="grid grid-cols-[minmax(0,38%)_1fr] gap-5 py-5 border-b border-graphite-line/40"
              >
                <dt className="font-[family-name:var(--font-display)] text-[16px] leading-[1.35] text-ivory">
                  {r.k}
                </dt>
                <dd className="font-[family-name:var(--font-editorial)] text-[14.5px] leading-[1.6] text-ivory-soft">
                  {r.v}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </div>
  )
}

// ─── How Professional Matchmaking works (brochure) ──────────────────

const MATCH_STEPS = [
  {
    n: '01',
    title: 'Enquiry',
    body: 'From a member, brand partner, event or The Club itself.',
  },
  {
    n: '02',
    title: 'Matched',
    body: 'Logged in our CRM and matched to your profile by client type, assets, sector and location.',
  },
  {
    n: '03',
    title: 'You',
    body: 'A dedicated contact meets, advises and quotes, and briefs The Club on the outcome.',
  },
  {
    n: '04',
    title: 'Tracked',
    body: 'Converted business is reported under the two-way introducer agreement.',
  },
] as const

export function HowMatchmakingWorks() {
  return (
    <>
      <SectionHead eyebrow="How Professional Matchmaking works" title="One route for every introduction." />

      <ol className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 lg:gap-6">
        {MATCH_STEPS.map((s, i) => (
          <li key={s.n} className="h-full">
          <Reveal type="up" delay={i * 110} className="h-full">
            <div className="h-full border border-graphite-line/40 bg-graphite/30 day:bg-white day:shadow-sm p-7 lg:p-8">
              <p className="font-[family-name:var(--font-display)] text-[clamp(2rem,2.6vw,2.5rem)] leading-none text-bronze-light tabular-nums">
                {s.n}
              </p>
              <h3 className="mt-5 font-[family-name:var(--font-display)] text-[clamp(1.25rem,1.5vw,1.4375rem)] text-ivory">
                {s.title}
              </h3>
              <p className="mt-3 font-[family-name:var(--font-editorial)] text-[15px] leading-[1.7] text-ivory-soft">
                {s.body}
              </p>
            </div>
          </Reveal>
          </li>
        ))}
      </ol>

      <div className="max-w-6xl mx-auto mt-14 lg:mt-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
        <Reveal type="up" delay={0} className="lg:col-span-6">
          {/* Verbatim (brief) */}
          <blockquote className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.5rem,2.4vw,2.25rem)] leading-[1.35] text-ivory">
            “Membership pays for the model. Commission rewards the result.”
          </blockquote>
        </Reveal>
        <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Reveal type="up" delay={150}>
            <div className="border-t border-bronze/55 pt-6">
              <p className="font-[family-name:var(--font-display)] text-[clamp(2.5rem,3.6vw,3.25rem)] leading-none text-bronze-light tabular-nums">
                5%
              </p>
              <p className="mt-4 font-[family-name:var(--font-editorial)] text-[15px] leading-[1.6] text-ivory-soft">
                Paid by The Club (ex VAT) on revenue from your referrals to us
              </p>
            </div>
          </Reveal>
          <Reveal type="up" delay={250}>
            <div className="border-t border-bronze/55 pt-6">
              <p className="font-[family-name:var(--font-display)] text-[clamp(2.5rem,3.6vw,3.25rem)] leading-none text-bronze-light tabular-nums">
                1–20%
              </p>
              <p className="mt-4 font-[family-name:var(--font-editorial)] text-[15px] leading-[1.6] text-ivory-soft">
                Agreed by you per service line, only on revenue we convert
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </>
  )
}

// ─── Next steps (brochure) ───────────────────────────────────────────

const NEXT_STEPS = [
  'Book a one-to-one with Sarah to set your objectives',
  'Choose your membership or partnership',
  'Complete your strategy profile',
  'Sign the two-way introducer agreement',
  'Hold your dates in the 2026–27 calendar',
] as const

export function NextSteps() {
  return (
    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
      <div className="lg:col-span-5">
        <Reveal type="up" delay={0}>
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
            Next steps
          </p>
        </Reveal>
        <Reveal type="clip" delay={150}>
          <h2 className="display-md">We look forward to building this with you.</h2>
        </Reveal>
        <Reveal type="up" delay={300}>
          <div className="mt-10 space-y-2 font-[family-name:var(--font-editorial)] text-[15px] text-ivory-soft">
            <p>
              <span className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.3em] text-ivory-soft/75 mr-3">
                Membership
              </span>
              <a
                href="mailto:membership@theclubgroup.co"
                className="text-ivory hover:text-bronze-light transition-colors"
              >
                membership@theclubgroup.co
              </a>
            </p>
            <p>
              <a href="mailto:sarah@theclubgroup.co" className="text-ivory hover:text-bronze-light transition-colors">
                sarah@theclubgroup.co
              </a>
            </p>
            <p>
              <a href="tel:+447921507442" className="text-ivory hover:text-bronze-light transition-colors">
                +44 (0)7921 507 442
              </a>
            </p>
          </div>
        </Reveal>
      </div>

      <div className="lg:col-span-7">
        <ol className="border-t border-graphite-line/40">
          {NEXT_STEPS.map((s, i) => (
            <li key={s} className="border-b border-graphite-line/40">
            <Reveal type="up" delay={i * 90}>
              <div className="flex items-baseline gap-6 py-6">
                <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.3em] tabular-nums text-bronze-light shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.5vw,1.375rem)] leading-[1.35] text-ivory">
                  {s}
                </span>
              </div>
            </Reveal>
            </li>
          ))}
        </ol>
        <Reveal type="up" delay={500}>
          <div className="mt-10">
            <PillLink href="/membership-application">Apply for membership</PillLink>
          </div>
        </Reveal>
      </div>
    </div>
  )
}
