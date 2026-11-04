import { formatPct, type StatBar } from '@/lib/cms/club-stats-shared'

// Horizontal percentage bars (sector / region / company size). Pure CSS —
// bar length is relative to the largest value in the set so short lists
// still read clearly; the printed figure is always the real percentage.
// Rendered as a description list so screen readers get "label: value".

export function BarList({
  bars,
  caption,
  dense = false,
}: {
  bars: StatBar[]
  /** Small-caps heading above the bars, e.g. "By region". */
  caption?: string
  dense?: boolean
}) {
  if (bars.length === 0) return null
  const max = Math.max(...bars.map((b) => b.pct), 1)
  return (
    <figure className="min-w-0">
      {caption && (
        <figcaption className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light mb-6">
          {caption}
        </figcaption>
      )}
      <dl className={dense ? 'space-y-3.5' : 'space-y-5'}>
        {bars.map((b, i) => (
          <div key={`${b.label}-${i}`} className="min-w-0">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="min-w-0 font-[family-name:var(--font-sans)] text-[13.5px] sm:text-[14.5px] font-light text-ivory-soft leading-snug">
                {b.label}
              </dt>
              <dd className="shrink-0 font-[family-name:var(--font-display)] text-[17px] sm:text-[19px] text-ivory tabular-nums">
                {formatPct(b.pct)}
              </dd>
            </div>
            <div aria-hidden className="mt-2 h-[3px] w-full bg-graphite-line/50 overflow-hidden rounded-full">
              <div
                className="h-full bg-bronze rounded-full"
                style={{ width: `${Math.max(1.5, (b.pct / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </dl>
    </figure>
  )
}
