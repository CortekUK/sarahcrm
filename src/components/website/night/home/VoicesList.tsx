import type { CarouselTestimonial } from './VoicesCarousel'

// VoicesList — the list-view counterpart to <VoicesCarousel />.
// Instead of showing one quote at a time and making the visitor click
// through, every voice is rendered at once, stacked down the page with
// a bronze hairline between each. Same editorial treatment as the
// carousel (ivory italic quote + NAME · ROLE · COMPANY attribution) so
// the two surfaces read as one brand voice.
//
// Server-renderable: no state, no effects — it's a static list, which
// is the whole point Sarah asked for over the rotating carousel.

export function VoicesList({ testimonials }: { testimonials: CarouselTestimonial[] }) {
  if (testimonials.length === 0) return null

  return (
    <div className="always-night max-w-3xl mx-auto divide-y divide-bronze/15">
      {testimonials.map((t) => (
        <article key={t.id} className="py-12 first:pt-0 last:pb-0">
          {/* Hairline above the quote — same mark as the carousel slide */}
          <div className="flex justify-center mb-6">
            <span className="block h-px w-16 bg-bronze/50" />
          </div>

          {/* Quote */}
          <blockquote className="text-center">
            <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.25rem,2vw,1.75rem)] leading-[1.55] text-ivory">
              <span aria-hidden className="text-bronze/40 mr-1 not-italic">
                “
              </span>
              {t.quote_text}
              <span aria-hidden className="text-bronze/40 ml-1 not-italic">
                ”
              </span>
            </p>
          </blockquote>

          {/* Attribution row: NAME · ROLE · COMPANY */}
          <div className="mt-7 flex justify-center">
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-center">
              <span className="text-bronze-light">{t.person_name}</span>
              {t.person_title && (
                <>
                  <span className="text-slate-haze">·</span>
                  <span className="text-ivory-soft">{t.person_title}</span>
                </>
              )}
              {t.company_name && (
                <>
                  <span className="text-slate-haze">·</span>
                  <span className="text-ivory-soft/80">{t.company_name}</span>
                </>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
