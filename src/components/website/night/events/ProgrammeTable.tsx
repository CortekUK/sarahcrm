import Link from 'next/link'
import { PROGRAMME_TABLE } from '@/components/website/events/programmes'

// "Five programmes, one calendar" — the brochure's programme table
// (programme, frequency, where, who). Each programme name links to the
// filtered /events view. Server component; stacks into cards below md.

export function ProgrammeTable() {
  return (
    <div>
      <div className="max-w-3xl mb-12 lg:mb-14">
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
          The Calendar · 2026–27
        </p>
        <h2 className="display-md leading-[1.1]">
          Five programmes, <em className="italic text-bronze-light">one calendar</em>.
        </h2>
      </div>

      {/* Desktop / tablet: table */}
      <table className="hidden md:table w-full border-t border-bronze/40 text-left">
        <thead>
          <tr className="border-b border-graphite-line/60">
            {['Programme', 'Frequency', 'Where', 'Who'].map((h) => (
              <th
                key={h}
                scope="col"
                className="py-4 pr-6 font-[family-name:var(--font-meta)] text-[10px] font-normal uppercase tracking-[0.36em] text-slate-haze"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PROGRAMME_TABLE.map((row) => (
            <tr key={row.programme} className="border-b border-graphite-line/40 align-top">
              <th scope="row" className="py-6 pr-6 font-normal">
                <Link
                  href={`/events?programme=${row.programme}`}
                  className="font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.5vw,1.375rem)] text-ivory hover:text-bronze-light transition-colors"
                >
                  {row.label}
                </Link>
              </th>
              <td className="py-6 pr-6 font-[family-name:var(--font-editorial)] text-[16px] text-ivory whitespace-nowrap">
                {row.frequency}
              </td>
              <td className="py-6 pr-6 font-[family-name:var(--font-editorial)] text-[16px] leading-[1.6] text-ivory-soft">
                {row.where}
              </td>
              <td className="py-6 font-[family-name:var(--font-editorial)] italic text-[16px] leading-[1.6] text-ivory-soft">
                {row.who}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile: stacked */}
      <ul className="md:hidden border-t border-bronze/40">
        {PROGRAMME_TABLE.map((row) => (
          <li key={row.programme} className="py-6 border-b border-graphite-line/40">
            <Link
              href={`/events?programme=${row.programme}`}
              className="font-[family-name:var(--font-display)] text-[1.25rem] text-ivory hover:text-bronze-light transition-colors"
            >
              {row.label}
            </Link>
            <dl className="mt-3 space-y-1.5 font-[family-name:var(--font-editorial)] text-[15px] leading-[1.6]">
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.3em] text-slate-haze pt-1">
                  Frequency
                </dt>
                <dd className="text-ivory">{row.frequency}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.3em] text-slate-haze pt-1">
                  Where
                </dt>
                <dd className="text-ivory-soft">{row.where}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-24 shrink-0 font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.3em] text-slate-haze pt-1">
                  Who
                </dt>
                <dd className="italic text-ivory-soft">{row.who}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
