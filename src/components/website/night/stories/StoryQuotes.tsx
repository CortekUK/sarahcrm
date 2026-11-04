import { Reveal } from '@/components/website/night/effects/Reveal'

// Real, permissioned quotes from public.testimonials — the same records
// that feed the homepage carousel. Name + company attribution, optional
// photo or logo.

export interface StoryQuote {
  id: string
  person_name: string
  person_title: string | null
  company_name: string | null
  quote_text: string
  photo_url: string | null
}

export function StoryQuotes({ quotes }: { quotes: StoryQuote[] }) {
  if (quotes.length === 0) return null
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
      {quotes.map((q, i) => (
        <Reveal key={q.id} type="up" delay={Math.min(i, 4) * 90} className="h-full">
          <figure className="h-full flex flex-col border border-graphite-line/60 bg-graphite-2 p-7 lg:p-9">
            <span aria-hidden className="font-[family-name:var(--font-display)] text-[56px] leading-[0.6] text-bronze/60">
              &ldquo;
            </span>
            <blockquote className="mt-4 flex-1 font-[family-name:var(--font-editorial)] italic text-[clamp(1.0625rem,1.3vw,1.25rem)] leading-[1.65] text-ivory">
              {q.quote_text}
            </blockquote>
            <figcaption className="mt-8 flex items-center gap-4 border-t border-graphite-line/60 pt-6">
              {q.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={q.photo_url}
                  alt=""
                  loading="lazy"
                  className="h-11 w-11 shrink-0 rounded-full object-cover border border-bronze/30 bg-graphite"
                />
              )}
              <div className="min-w-0">
                <p className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.3em] text-bronze-light">
                  {q.person_name}
                </p>
                {(q.person_title || q.company_name) && (
                  <p className="mt-1.5 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.24em] text-ivory-soft">
                    {[q.person_title, q.company_name].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            </figcaption>
          </figure>
        </Reveal>
      ))}
    </div>
  )
}
