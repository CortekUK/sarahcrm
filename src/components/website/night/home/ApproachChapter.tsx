import Image from 'next/image'
import { Chapter, EditorialMeta } from '../primitives/Chapter'

// "The Approach" — homepage chapter 02.
// Copy is verbatim from the existing live site, with italics on the
// emphasised phrases (one-to-one, strategise, plan, personal
// relationships) preserved exactly as in the source.
//
// Layout reverses IntroChapter's — image on the LEFT, text on the
// RIGHT — to give the homepage visual rhythm. Image stays static
// (no swap) since this chapter is shorter and a swap would be too
// busy back-to-back with chapter 01.

// Real client image — public/theapproch-image.png
const APPROACH_IMAGE = '/theapproch-image.png'

export function ApproachChapter() {
  return (
    <Chapter density="default" bg="graphite">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start">
        {/* ── Image (left on desktop, stacked above on mobile) ───────── */}
        <aside className="lg:col-span-5 lg:order-1 order-1">
          <div className="lg:sticky lg:top-32">
            <div className="relative aspect-[4/5] overflow-hidden bg-graphite-2">
              <Image
                src={APPROACH_IMAGE}
                alt="The Approach"
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 40vw, 100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-ink/35 via-transparent to-ink/40 pointer-events-none" />
              <div className="film-grain-night" />
              {/* Bronze hairline corner marks */}
              <span className="absolute top-4 left-4 w-6 h-px bg-bronze/70 pointer-events-none z-10" />
              <span className="absolute top-4 left-4 w-px h-6 bg-bronze/70 pointer-events-none z-10" />
              <span className="absolute bottom-4 right-4 w-6 h-px bg-bronze/70 pointer-events-none z-10" />
              <span className="absolute bottom-4 right-4 w-px h-6 bg-bronze/70 pointer-events-none z-10" />
            </div>
          </div>
        </aside>

        {/* ── Text column ─────────────────────────────────────────────── */}
        <div className="lg:col-span-7 lg:order-2 order-2 max-w-2xl">
          <EditorialMeta number="02" label="The Approach" />

          {/* display-md (not display-lg) — 22 words at display-lg
              wrapped to 8-9 lines in this column width and read badly. */}
          <h2 className="display-md mt-12 mb-10 text-ivory">
            Engaging on a{' '}
            <em className="font-[family-name:var(--font-editorial)] italic">one-to-one</em>{' '}
            basis, we{' '}
            <em className="font-[family-name:var(--font-editorial)] italic">strategise</em>{' '}
            and{' '}
            <em className="font-[family-name:var(--font-editorial)] italic">plan</em>{' '}
            connections, fostering close,{' '}
            <em className="font-[family-name:var(--font-editorial)] italic">
              personal relationships
            </em>{' '}
            with our members.
          </h2>

          <div className="body-prose space-y-7">
            <p>
              This unique approach not only allows for a deeper understanding of individual needs but also provides opportunities for members to establish meaningful connections and discover potential business ventures.
            </p>
            <p>
              The result is a tangible and mutually beneficial outcome, reflecting our commitment to personalised and effective networking in a luxury setting. An affinity of like minded individuals supporting business growth across all sectors.
            </p>
          </div>
        </div>
      </div>
    </Chapter>
  )
}
