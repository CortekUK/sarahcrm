import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { Reveal } from '../effects/Reveal'
import type { StatTile } from '@/lib/cms/club-stats-shared'

// "The Club in numbers" — six stat tiles. Shared by the homepage (chapter
// 03, replacing Locations) and /about. Figures come from app_settings
// 'club_stats' (read server-side by the page and passed in), so Sarah edits
// them at /dashboard/website/club-numbers without a code change.

export function ClubNumbersGrid({ tiles }: { tiles: StatTile[] }) {
  if (tiles.length === 0) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-graphite-line/60">
      {tiles.map((t, i) => (
        <Reveal
          key={`${t.value}-${i}`}
          type="up"
          delay={i * 90}
          className="border-r border-b border-graphite-line/60 p-7 sm:p-9 lg:p-11"
        >
          <p className="font-[family-name:var(--font-display)] text-[clamp(2.4rem,4.4vw,3.75rem)] leading-none tracking-[-0.02em] text-ivory">
            {t.value}
          </p>
          <span aria-hidden className="block h-px w-10 bg-bronze/60 my-5" />
          <p className="font-[family-name:var(--font-sans)] text-[14.5px] font-light leading-relaxed text-ivory-soft max-w-xs">
            {t.label}
          </p>
        </Reveal>
      ))}
    </div>
  )
}

export function ClubNumbers({
  tiles,
  number,
  bg = 'ink',
}: {
  tiles: StatTile[]
  /** Chapter marker, e.g. "03" on the homepage. */
  number?: string
  bg?: 'ink' | 'graphite'
}) {
  if (tiles.length === 0) return null
  return (
    <Chapter density="tight" bg={bg}>
      <div className="max-w-3xl mb-12 lg:mb-16">
        <Reveal type="up" delay={0}>
          <EditorialMeta number={number} label="The Club in numbers" />
        </Reveal>
        <Reveal type="clip" delay={150}>
          <h2 className="display-md mt-8 text-ivory">
            The reach behind every{' '}
            <em className="font-[family-name:var(--font-editorial)] italic text-bronze-light">
              introduction
            </em>
            .
          </h2>
        </Reveal>
      </div>
      <ClubNumbersGrid tiles={tiles} />
    </Chapter>
  )
}
