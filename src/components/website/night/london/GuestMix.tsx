import { cn } from '@/lib/utils'

// Target guest mix as one stacked bar + legend (London Series detail).
const SHADES = ['bg-bronze', 'bg-bronze-light', 'bg-plum-light', 'bg-slate-haze']

export function GuestMix({ mix, note }: { mix: [string, number][]; note?: string }) {
  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-graphite-line/50"
        role="img"
        aria-label={mix.map(([l, p]) => `${l} ${p}%`).join(', ')}
      >
        {mix.map(([label, pct], i) => (
          <span key={label} className={cn('h-full', SHADES[i % SHADES.length])} style={{ width: `${pct}%` }} />
        ))}
      </div>
      <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
        {mix.map(([label, pct], i) => (
          <li key={label} className="flex items-center gap-3 text-[14px] text-ivory-soft">
            <span aria-hidden className={cn('w-2.5 h-2.5 rounded-full shrink-0', SHADES[i % SHADES.length])} />
            <span className="flex-1">{label}</span>
            <span className="tabular-nums text-ivory">{pct}%</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-5 text-[12.5px] leading-relaxed text-slate-haze">{note}</p>}
    </div>
  )
}
