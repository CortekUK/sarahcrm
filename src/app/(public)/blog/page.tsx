import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { formatBlogDate, listPublishedBlogPosts } from '@/lib/cms/blog'

export const revalidate = 60

export async function generateMetadata() {
  return {
    title: 'The Journal — The Club by Sarah Restrick',
    description:
      'Stories, event recaps and reflections from The Club by Sarah Restrick — a private membership community of exceptional people.',
  }
}

// ─────────────────────────────────────────────────────────────────────
// /blog — "The Journal": the public blog listing.
//
//   01 Hero    — eyebrow + headline + italic lede (text only, aurora)
//   02 Posts   — newest first; card = hero image, date, title, excerpt
//
// Posts come from public.blog_posts, written by the Marketing AI Engine
// when an admin approves a blog asset (BlogPublisher). The publisher
// revalidates this path on publish / unpublish; `revalidate` is the
// safety net.
// ─────────────────────────────────────────────────────────────────────

export default async function BlogPage() {
  const posts = await listPublishedBlogPosts()

  return (
    <>
      {/* ── 01 · Hero ─────────────────────────────────────────── */}
      <section className="relative w-full always-night overflow-hidden bg-ink">
        <Aurora variant="dusk" />
        <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 pt-44 pb-20 lg:pt-52 lg:pb-24">
          <Reveal type="up" delay={0}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
              The Journal
            </p>
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h1 className="display-xl max-w-4xl">Stories.</h1>
          </Reveal>
          <Reveal type="up" delay={400}>
            <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.25vw,1.25rem)] leading-[1.7] text-ivory-soft mt-6 max-w-2xl">
              Evenings remembered, conversations worth repeating and the people who make The Club
              what it is.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── 02 · Posts ────────────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        <div className="max-w-[1400px] mx-auto">
          {posts.length === 0 ? (
            <Reveal type="up" delay={0}>
              <div className="border-t border-graphite-line/50 pt-12 max-w-xl">
                <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.125rem,1.4vw,1.375rem)] leading-[1.7] text-ivory-soft">
                  The first stories are being written. In the meantime, explore what&rsquo;s coming
                  up on the calendar.
                </p>
                <Link
                  href="/events"
                  className="mt-8 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-500"
                >
                  View events
                  <ArrowUpRight size={14} strokeWidth={1.5} />
                </Link>
              </div>
            </Reveal>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
              {posts.map((post, i) => (
                <Reveal key={post.id} type="up" delay={Math.min(i, 5) * 80}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group flex h-full flex-col border border-graphite-line/40 hover:border-bronze/55 transition-colors duration-500 bg-graphite-2 overflow-hidden"
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-graphite">
                      {post.hero_image_url ? (
                        // Plain <img>: hero images can come from any host the
                        // admin picked (Drive / upload / URL), not only the
                        // next/image allow-list.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.hero_image_url}
                          alt={post.title}
                          loading="lazy"
                          className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-105"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="font-[family-name:var(--font-display)] text-7xl text-slate-dim">
                            {post.title.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
                      <div className="film-grain-night pointer-events-none" />
                    </div>

                    <div className="flex flex-1 flex-col p-7 lg:p-9">
                      {formatBlogDate(post.published_at) && (
                        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze">
                          {formatBlogDate(post.published_at)}
                        </p>
                      )}
                      <h2 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(1.5rem,2vw,2rem)] leading-[1.15] text-ivory group-hover:text-bronze-light transition-colors duration-500">
                        {post.title}
                      </h2>
                      {post.excerpt && (
                        <p className="mt-5 font-[family-name:var(--font-editorial)] italic text-[17px] leading-[1.7] text-ivory-soft line-clamp-3">
                          {post.excerpt}
                        </p>
                      )}
                      <p className="mt-auto pt-8 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light group-hover:text-ivory transition-colors duration-500">
                        Read
                        <ArrowUpRight
                          size={14}
                          strokeWidth={1.5}
                          className="transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        />
                      </p>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </Chapter>
    </>
  )
}
