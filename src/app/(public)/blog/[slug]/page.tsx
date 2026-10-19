import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { formatBlogDate, getPublishedBlogPost } from '@/lib/cms/blog'

export const revalidate = 60

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPublishedBlogPost(slug)
  if (!post) return { title: 'The Journal — The Club by Sarah Restrick' }
  return {
    title: `${post.title} — The Club by Sarah Restrick`,
    description: post.excerpt ?? undefined,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt ?? undefined,
      publishedTime: post.published_at ?? undefined,
      images: post.hero_image_url ? [post.hero_image_url] : undefined,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────
// /blog/[slug] — a single Journal article.
//
//   01 Hero    — hero image (or aurora), back link, date, title, excerpt
//   02 Article — the sanitized body HTML in the editorial register
//   03 Close   — linked event (when public) + membership call to action
//
// body_html is produced and sanitized (DOMPurify) by BlogPublisher at
// publish time, so it is rendered as-is here. Only rows with
// status='published' are readable (RLS), so an unpublished post 404s.
// ─────────────────────────────────────────────────────────────────────

// Editorial styling for the generated HTML (h2/h3/h4, p, lists, quotes,
// links) via descendant selectors — keeps the shared globals.css untouched.
const ARTICLE_CLASSES = [
  'font-[family-name:var(--font-editorial)] text-[clamp(1.125rem,1.4vw,1.375rem)] leading-[1.8] text-ivory max-w-prose',
  '[&>*+*]:mt-6',
  '[&_h2]:font-[family-name:var(--font-display)] [&_h2]:text-[clamp(1.5rem,2.6vw,2.25rem)] [&_h2]:leading-[1.15] [&_h2]:tracking-[-0.01em] [&_h2]:text-ivory [&_h2]:!mt-14',
  '[&_h3]:font-[family-name:var(--font-display)] [&_h3]:text-[clamp(1.25rem,1.8vw,1.625rem)] [&_h3]:leading-[1.2] [&_h3]:text-ivory [&_h3]:!mt-10',
  '[&_h4]:font-[family-name:var(--font-meta)] [&_h4]:text-[11px] [&_h4]:uppercase [&_h4]:tracking-[0.32em] [&_h4]:text-bronze-light [&_h4]:!mt-10',
  '[&_a]:text-bronze-light [&_a]:underline [&_a]:underline-offset-4 [&_a]:decoration-bronze/40 hover:[&_a]:decoration-bronze-light',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_li]:mt-2 [&_li]:marker:text-bronze',
  '[&_blockquote]:border-l [&_blockquote]:border-bronze/60 [&_blockquote]:pl-6 [&_blockquote]:italic [&_blockquote]:text-ivory-soft',
  '[&_hr]:border-graphite-line/50',
  '[&_code]:font-mono [&_code]:text-[0.85em]',
].join(' ')

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPublishedBlogPost(slug)
  if (!post) notFound()

  const date = formatBlogDate(post.published_at)

  return (
    <>
      {/* ── 01 · Hero ─────────────────────────────────────────── */}
      <section className="relative min-h-[70vh] w-full always-night overflow-hidden bg-ink">
        {post.hero_image_url ? (
          <>
            {/* Plain <img>: the hero can come from any host the admin
               picked, not only the next/image allow-list. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.hero_image_url}
              alt={post.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0" style={{ background: 'rgba(14, 16, 20, 0.55)' }} />
            <div className="film-grain-night" />
          </>
        ) : (
          <Aurora variant="dusk" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-[55%] hero-fade-bottom pointer-events-none" />

        <div className="relative z-10 min-h-[70vh] max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pt-32 pb-20">
          <Reveal type="up" delay={0}>
            <Link
              href="/blog"
              className="self-start inline-flex items-center gap-2 mb-9 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory-soft hover:text-bronze-light transition-colors duration-300"
            >
              <ArrowLeft size={13} strokeWidth={1.5} />
              The Journal
            </Link>
          </Reveal>
          {date && (
            <Reveal type="up" delay={150}>
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
                {date}
              </p>
            </Reveal>
          )}
          <Reveal type="clip" delay={250}>
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,4.4vw,4rem)] leading-[1.1] tracking-[-0.01em] text-ivory max-w-4xl">
              {post.title}
            </h1>
          </Reveal>
          {post.excerpt && (
            <Reveal type="up" delay={450}>
              <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.25vw,1.25rem)] leading-[1.7] text-ivory-soft mt-6 max-w-2xl">
                {post.excerpt}
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── 02 · Article ──────────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        <article className="max-w-[1400px] mx-auto">
          <div className={ARTICLE_CLASSES} dangerouslySetInnerHTML={{ __html: post.body_html }} />
        </article>
      </Chapter>

      {/* ── 03 · Close ────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-graphite border-t border-graphite-line/40">
        <Aurora variant="soft" />
        <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 py-20 lg:py-24 grid grid-cols-1 lg:grid-cols-2 gap-12">
          {post.event && (
            <div>
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
                The Evening
              </p>
              <Link
                href={`/events/${post.event.slug}`}
                className="group inline-flex items-start gap-3 font-[family-name:var(--font-display)] text-[clamp(1.5rem,2.4vw,2.25rem)] leading-[1.15] text-ivory hover:text-bronze-light transition-colors duration-500"
              >
                {post.event.title}
                <ArrowUpRight
                  size={20}
                  strokeWidth={1.5}
                  className="mt-2 shrink-0 transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </Link>
            </div>
          )}
          <div className={post.event ? '' : 'lg:col-span-2'}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
              Membership
            </p>
            <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.0625rem,1.3vw,1.25rem)] leading-[1.7] text-ivory-soft max-w-md">
              Curated evenings, bespoke introductions and a community of exceptional people.
            </p>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4">
              <Link
                href="/membership-application"
                className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-500"
              >
                Apply for membership
                <ArrowUpRight size={14} strokeWidth={1.5} />
              </Link>
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-ivory-soft hover:text-bronze-light transition-colors duration-500"
              >
                More from the Journal
                <ArrowUpRight size={14} strokeWidth={1.5} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
