import Image from 'next/image'
import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { TracingBeam } from '../effects/TracingBeam'
import { Reveal } from '../effects/Reveal'

// "The Club" — homepage chapter 01.
// Copy verbatim from theclubbysarahrestrick.com.
//
// Reveal cascade (left column):
//   0ms     — eyebrow (fade-up)
//   200ms   — headline (clip-path mask reveal — text appears to slide
//             up from beneath a horizontal line)
//   600ms   — body prose (fade-up)
// Image column:
//   100ms   — image (subtle scale-in from 0.96)

// Real client image — public/theclub-section.png
const INTRO_IMAGE = '/theclub-section.png'

export function IntroChapter() {
  return (
    <Chapter density="default" bg="ink">
      <TracingBeam>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16">
          {/* ── Text column ─────────────────────────────────────────── */}
          <div className="lg:col-span-7 max-w-2xl">
            <Reveal type="up" delay={0}>
              <EditorialMeta number="01" label="The Club" />
            </Reveal>

            <Reveal type="clip" delay={200}>
              <h2 className="display-lg mt-10 mb-8 text-ivory">
                Connecting{' '}
                <em className="font-[family-name:var(--font-editorial)] italic">leaders</em>
                <br />
                in business
                <br />
                through{' '}
                <em className="font-[family-name:var(--font-editorial)] italic">luxury</em>
                <br />
                <em className="font-[family-name:var(--font-editorial)] italic">experience</em>.
              </h2>
            </Reveal>

            <Reveal type="up" delay={600}>
              <div className="body-prose space-y-7">
                <p>
                  The Club by Sarah Restrick is a private members club, curating invaluable networking opportunities through exclusive luxury events.
                </p>
                <p>
                  More than just networking, connecting business leaders, owners, high level executives and HNWIs through a calendar of luxury events at five star venues across the UK and beyond.
                </p>
              </div>
            </Reveal>
          </div>

          {/* ── Sticky image column ─────────────────────────────────── */}
          <aside className="lg:col-span-5">
            <div className="lg:sticky lg:top-32">
              <Reveal type="scale" delay={100}>
                <div className="relative aspect-[4/5] overflow-hidden bg-graphite-2">
                  <Image
                    src={INTRO_IMAGE}
                    alt="The Club"
                    fill
                    priority
                    className="object-cover"
                    sizes="(min-width: 1024px) 40vw, 100vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-ink/35 via-transparent to-ink/40 pointer-events-none" />
                  <div className="film-grain-night" />
                  <span className="absolute top-4 left-4 w-6 h-px bg-bronze/70 pointer-events-none z-10" />
                  <span className="absolute top-4 left-4 w-px h-6 bg-bronze/70 pointer-events-none z-10" />
                  <span className="absolute bottom-4 right-4 w-6 h-px bg-bronze/70 pointer-events-none z-10" />
                  <span className="absolute bottom-4 right-4 w-px h-6 bg-bronze/70 pointer-events-none z-10" />
                </div>
              </Reveal>
            </div>
          </aside>
        </div>
      </TracingBeam>
    </Chapter>
  )
}
