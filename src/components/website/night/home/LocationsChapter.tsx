import Image from 'next/image'
import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { Reveal } from '../effects/Reveal'

// "Locations" — homepage chapter 03.
// Copy verbatim from existing live site (title + intro paragraph).
//
// Each card has an atmospheric image background + the diamond "C"
// monogram (matches the existing brand pattern) + city name beneath.
// All three city images are PLACEHOLDERS to be swapped for real venue /
// city photography. Listed at the top of the file for easy replacement.

const LOCATIONS = [
  {
    name: 'The Club Manchester',
    image: '/manchester.png',
    alt: 'The Club Manchester',
  },
  {
    name: 'The Club Leeds',
    image: 'https://images.unsplash.com/photo-1518391846015-55a9cc003b25?auto=format&fit=crop&w=1200&q=85',
    alt: 'Placeholder — city at night',
  },
  {
    name: 'The Club London',
    image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1200&q=85',
    alt: 'London skyline',
  },
]

export function LocationsChapter() {
  return (
    <Chapter density="default" bg="ink">
      <div className="text-center max-w-3xl mx-auto mb-20">
        <Reveal type="up" delay={0}>
          <EditorialMeta number="03" label="Locations" align="center" />
        </Reveal>
        <Reveal type="clip" delay={150}>
          <h2 className="display-lg mt-12 mb-8 text-ivory">
            Experience luxury by location.
          </h2>
        </Reveal>
        <Reveal type="up" delay={500}>
          <p className="lede">
            Explore both upcoming and past events hosted by The Club. Delve into the networking opportunities awaiting you, witness the doors ready to open at our diverse gatherings, and peruse our showcase events featuring esteemed brand partners.
          </p>
        </Reveal>
      </div>

      {/* City cards — image background + diamond C monogram overlay.
          Each card reveals with a 180ms stagger so the row "deals out"
          left to right rather than appearing at once. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 max-w-6xl mx-auto">
        {LOCATIONS.map((loc, idx) => (
          <Reveal
            key={loc.name}
            type="up"
            delay={700 + idx * 180}
            className="group relative flex flex-col items-center"
          >
            {/* Image card with diamond overlay — pinned to the night
                palette so the ink-tinted scrim stays a dark wash that
                lets the photo show through, instead of cream-washing
                it out in day mode. */}
            <div className="always-night relative w-full aspect-[4/5] overflow-hidden bg-graphite-2">
              <Image
                src={loc.image}
                alt={loc.alt}
                fill
                className="object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-[1.04]"
                sizes="(min-width: 768px) 33vw, 100vw"
              />
              {/* Dark overlay so monogram stays legible against any frame */}
              <div className="absolute inset-0 bg-ink/55 group-hover:bg-ink/45 transition-colors duration-500" />
              <div className="film-grain-night" />

              {/* Gold logo monogram (real brand asset) */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Image
                  src="/logo-gold.png"
                  alt=""
                  width={144}
                  height={144}
                  className="w-32 h-32 lg:w-36 lg:h-36 transition-transform duration-700 group-hover:scale-[1.06]"
                />
              </div>

              {/* Bronze hairline corner marks — editorial framing */}
              <span className="absolute top-4 left-4 w-6 h-px bg-bronze/70 pointer-events-none" />
              <span className="absolute top-4 left-4 w-px h-6 bg-bronze/70 pointer-events-none" />
              <span className="absolute bottom-4 right-4 w-6 h-px bg-bronze/70 pointer-events-none" />
              <span className="absolute bottom-4 right-4 w-px h-6 bg-bronze/70 pointer-events-none" />
            </div>

            {/* Card label */}
            <div className="mt-7 flex flex-col items-center gap-4">
              <span className="h-px w-12 bg-bronze/40" />
              <p className="font-[family-name:var(--font-display)] text-[clamp(1.125rem,1.4vw,1.375rem)] text-ivory">
                {loc.name}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </Chapter>
  )
}
