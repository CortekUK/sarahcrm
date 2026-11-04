import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { HeroFilm } from '@/components/website/night/portfolio/HeroFilm'
import { CaseStudyCard } from '@/components/website/night/portfolio/PortfolioBrowser'
import { Pill, SectionLabel } from '@/components/website/night/portfolio/Pill'
import {
  caseStudyWhen,
  getCaseStudy,
  listCaseStudies,
  portfolioCategoryLabel,
} from '@/lib/cms/portfolio'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const cs = await getCaseStudy(slug)
  if (!cs) return { title: 'Portfolio | The Club by Sarah Restrick' }
  const description =
    [cs.headline_result, cs.brief].filter(Boolean).join('. ').slice(0, 160) ||
    `A case study from The Club's portfolio.`
  return {
    title: `${cs.title} | Portfolio | The Club by Sarah Restrick`,
    description,
    alternates: { canonical: `/portfolio/${cs.slug}` },
    openGraph: {
      title: cs.title,
      description,
      images: cs.hero_image_url ? [cs.hero_image_url] : undefined,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────
// /portfolio/[slug] — one case study.
//
//   Hero (image or film) · title · partner(s) · date · venue · programme
//   The brief · What we delivered · Results (stat tiles) · Gallery
//   Partner quote · Related case studies · CTA
//
// Only published rows are readable (RLS), so a draft 404s. Every
// section hides cleanly when its field is empty.
// ─────────────────────────────────────────────────────────────────────

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const cs = await getCaseStudy(slug)
  if (!cs) notFound()

  const [all, linkedEvent] = await Promise.all([listCaseStudies(), loadLinkedEvent(cs.event_id)])

  // Related: same programme first, then the rest, max three.
  const others = all.filter((c) => c.id !== cs.id)
  const related = [
    ...others.filter((c) => c.category === cs.category),
    ...others.filter((c) => c.category !== cs.category),
  ].slice(0, 3)

  const when = caseStudyWhen(cs)
  const facts: { label: string; value: string }[] = [
    cs.partner_names ? { label: 'Partner', value: cs.partner_names } : null,
    when ? { label: 'Date', value: when } : null,
    cs.location ? { label: 'Venue', value: cs.location } : null,
    { label: 'Programme', value: portfolioCategoryLabel(cs.category) },
  ].filter((f): f is { label: string; value: string } => !!f)

  // Show the gallery once it adds something beyond the hero image.
  const gallery = cs.gallery_urls.some((u) => u !== cs.hero_image_url) ? cs.gallery_urls : []

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative min-h-[78vh] w-full always-night overflow-hidden bg-ink">
        <HeroFilm filmUrl={cs.hero_video_url} stillUrl={cs.hero_image_url} alt={cs.title} overlay={0.5} />
        <div className="absolute inset-x-0 bottom-0 h-[60%] hero-fade-bottom pointer-events-none" />
        <div className="relative z-10 min-h-[78vh] max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pt-32 pb-16 lg:pb-20">
          <Reveal type="up" delay={0}>
            <Link
              href="/portfolio"
              className="self-start inline-flex items-center gap-2 mb-9 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory-soft hover:text-bronze-light transition-colors duration-300"
            >
              <ArrowLeft size={13} strokeWidth={1.5} />
              Portfolio
            </Link>
          </Reveal>
          <Reveal type="up" delay={100}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
              Case study · {portfolioCategoryLabel(cs.category)}
            </p>
          </Reveal>
          <Reveal type="clip" delay={200}>
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,5vw,4.5rem)] leading-[1.05] tracking-[-0.01em] text-ivory max-w-5xl">
              {cs.title}
            </h1>
          </Reveal>
          {cs.headline_result && (
            <Reveal type="up" delay={400}>
              <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.125rem,1.6vw,1.5rem)] text-bronze-light mt-5">
                {cs.headline_result}
              </p>
            </Reveal>
          )}
          <Reveal type="up" delay={550}>
            <dl className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-5 border-t border-ivory/15 pt-6 max-w-4xl">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.34em] text-slate-haze mb-1.5">
                    {f.label}
                  </dt>
                  <dd className="font-[family-name:var(--font-editorial)] text-[15px] leading-snug text-ivory">
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
          {linkedEvent && (
            <Reveal type="up" delay={650}>
              <p className="mt-6 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-ivory-soft">
                The event:{' '}
                <Link href={`/events/${linkedEvent.slug}`} className="text-bronze-light hover:text-ivory transition-colors">
                  {linkedEvent.title}
                </Link>
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── The brief + What we delivered ─────────────────────── */}
      {(cs.brief || cs.delivered.length > 0) && (
        <Chapter density="tight" bg="ink">
          <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
            {cs.brief && (
              <div className={cs.delivered.length > 0 ? 'lg:col-span-6' : 'lg:col-span-8'}>
                <SectionLabel>The brief</SectionLabel>
                <Reveal type="up" delay={0}>
                  <p className="font-[family-name:var(--font-editorial)] text-[clamp(1.125rem,1.5vw,1.4rem)] leading-[1.75] text-ivory">
                    {cs.brief}
                  </p>
                </Reveal>
              </div>
            )}
            {cs.delivered.length > 0 && (
              <div className={cs.brief ? 'lg:col-span-6' : 'lg:col-span-8'}>
                <SectionLabel>What we delivered</SectionLabel>
                <ul className="space-y-4">
                  {cs.delivered.map((d, i) => (
                    <Reveal key={i} type="up" delay={Math.min(i, 5) * 70}>
                      <li className="flex gap-4 border-b border-graphite-line/50 pb-4">
                        <span className="mt-[0.7em] h-px w-5 shrink-0 bg-bronze" aria-hidden />
                        <span className="font-[family-name:var(--font-editorial)] text-[16px] leading-[1.7] text-ivory-soft">
                          {d}
                        </span>
                      </li>
                    </Reveal>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Chapter>
      )}

      {/* ── Results ───────────────────────────────────────────── */}
      {cs.results.length > 0 && (
        <Chapter density="tight" bg="graphite">
          <div className="max-w-[1400px] mx-auto">
            <SectionLabel>Results</SectionLabel>
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 ${cs.results.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-px bg-graphite-line/50 border border-graphite-line/50`}
            >
              {cs.results.map((r, i) => (
                <Reveal key={i} type="up" delay={i * 80} className="bg-graphite">
                  <div className="h-full p-7 lg:p-9">
                    <p className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,4vw,3.5rem)] leading-none text-bronze-light tabular-nums">
                      {r.figure}
                    </p>
                    <p className="mt-4 font-[family-name:var(--font-editorial)] text-[15px] leading-[1.6] text-ivory-soft">
                      {r.label}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Chapter>
      )}

      {/* ── Gallery ───────────────────────────────────────────── */}
      {gallery.length > 0 && (
        <Chapter density="tight" bg="ink">
          <div className="max-w-[1400px] mx-auto">
            <SectionLabel>Gallery</SectionLabel>
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-3 lg:gap-4 [&>*]:mb-3 lg:[&>*]:mb-4">
              {gallery.map((src, i) => (
                <Reveal key={src + i} type="up" delay={Math.min(i, 6) * 60} className="break-inside-avoid">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`${cs.title}, photograph ${i + 1}`}
                    loading="lazy"
                    className="w-full h-auto block bg-graphite"
                  />
                </Reveal>
              ))}
            </div>
          </div>
        </Chapter>
      )}

      {/* ── Partner quote ─────────────────────────────────────── */}
      {cs.partner_quote && (
        <Chapter density="tight" bg="graphite">
          <figure className="max-w-4xl mx-auto text-center">
            <Reveal type="up" delay={0}>
              <span aria-hidden className="block font-[family-name:var(--font-display)] text-[72px] leading-none text-bronze/70">
                &ldquo;
              </span>
            </Reveal>
            <Reveal type="clip" delay={150}>
              <blockquote className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.375rem,2.4vw,2.125rem)] leading-[1.45] text-ivory">
                {cs.partner_quote}
              </blockquote>
            </Reveal>
            {cs.partner_quote_by && (
              <Reveal type="up" delay={350}>
                <figcaption className="mt-8 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.34em] text-bronze-light">
                  {cs.partner_quote_by}
                </figcaption>
              </Reveal>
            )}
          </figure>
        </Chapter>
      )}

      {/* ── Related case studies ──────────────────────────────── */}
      {related.length > 0 && (
        <Chapter density="tight" bg="ink">
          <div className="max-w-[1400px] mx-auto">
            <SectionLabel>Related case studies</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">
              {related.map((r) => (
                <CaseStudyCard key={r.id} item={r} full={false} />
              ))}
            </div>
          </div>
        </Chapter>
      )}

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="always-night relative overflow-hidden bg-plum py-20 md:py-28">
        <Aurora variant="dusk" z={0} />
        <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 text-center">
          <Reveal type="clip" delay={0}>
            <h2 className="display-md text-ivory">
              Build a room <em className="text-bronze-light">like this.</em>
            </h2>
          </Reveal>
          <Reveal type="up" delay={250}>
            <div className="mt-10 flex flex-col md:flex-row items-stretch md:items-center justify-center gap-4 md:gap-5 max-w-sm md:max-w-none mx-auto">
              <Pill href="/concierge#event-services" variant="solid">
                Plan an event with us
              </Pill>
              <Pill href="/partner/sponsorship">Sponsor an event</Pill>
              <Pill href="/membership-application">Apply for membership</Pill>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  )
}

// The linked event, read like the public event pages read events (the
// visitor's client + public statuses), so the link only shows when
// /events/<slug> would render for this visitor.
async function loadLinkedEvent(eventId: string | null): Promise<{ title: string; slug: string } | null> {
  if (!eventId) return null
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('events')
      .select('title, slug')
      .eq('id', eventId)
      .in('status', ['published', 'live', 'completed'])
      .eq('visibility', 'public')
      .maybeSingle()
    return data?.slug ? { title: data.title, slug: data.slug } : null
  } catch {
    return null
  }
}
