import { Chapter, EditorialMeta } from '../primitives/Chapter'
import { KenBurnsImage, FullBleed } from '../primitives/MediaBlocks'

// "A Night at The Club" — three full-bleed photographs in a vertical
// sequence with slow KenBurns drift. Functions as a cinematic visual
// interlude between the textual chapters.
//
// Fabricated captions and per-frame headlines have been removed —
// nothing is put in Sarah's voice. The photos speak for themselves
// with only a small frame counter for editorial cadence.
//
// Photos are stock placeholders to be replaced when real event
// photography is available.

const SEQUENCE: Array<{
  src: string
  alt: string
  motion: 'in' | 'out' | 'left' | 'right'
}> = [
  {
    src: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=2400&q=85',
    alt: 'A private dining room with set tables',
    motion: 'in',
  },
  {
    src: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=2400&q=85',
    alt: 'A long candlelit dining table',
    motion: 'left',
  },
  {
    src: 'https://images.unsplash.com/photo-1525268323446-0505b6fe7778?auto=format&fit=crop&w=2400&q=85',
    alt: 'A back-lit bar at the end of the night',
    motion: 'out',
  },
]

export function NightSequence() {
  return (
    <Chapter density="tight" bg="ink">
      <div className="text-center max-w-2xl mx-auto">
        <EditorialMeta label="A Night" align="center" />
      </div>

      <div className="mt-16 space-y-16">
        {SEQUENCE.map((scene, i) => (
          <div key={i} className="relative">
            <FullBleed height="tall">
              <KenBurnsImage
                src={scene.src}
                alt={scene.alt}
                motion={scene.motion}
                duration={32}
                overlay={0.35}
              />
              {/* Frame counter — top left, editorial cadence */}
              <div className="absolute top-8 left-8 lg:top-12 lg:left-12 flex items-center gap-3 z-10">
                <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-ivory/80 tabular-nums">
                  {String(i + 1).padStart(2, '0')} / {String(SEQUENCE.length).padStart(2, '0')}
                </span>
                <span className="h-px w-10 bg-bronze/60" />
              </div>
            </FullBleed>
          </div>
        ))}
      </div>
    </Chapter>
  )
}
