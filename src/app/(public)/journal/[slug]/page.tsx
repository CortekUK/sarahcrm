import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowUpRight, Lock } from 'lucide-react'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { JournalSignup } from '@/components/website/night/journal/JournalSignup'
import { MetaLink, Pill } from '@/components/website/night/portfolio/Pill'
import { formatBlogDate, getJournalPost, getJournalViewer, journalStrandLabel } from '@/lib/cms/blog'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const viewer = await getJournalViewer()
  const post = await getJournalPost(slug, viewer.isMember)
  if (!post) {
    // Unknown, unpublished or members-only for this visitor: say nothing.
    return { title: 'The Journal | The Club by Sarah Restrick', robots: { index: false, follow: false } }
  }
  const membersOnly = post.visibility === 'members'
  return {
    title: `${post.title} | The Journal | The Club by Sarah Restrick`,
    description: post.excerpt ?? undefined,
    alternates: { canonical: `/journal/${post.slug}` },
    robots: membersOnly ? { index: false, follow: false } : undefined,
    openGraph: membersOnly
      ? undefined
      : {
          type: 'article',
          title: post.title,
          description: post.excerpt ?? undefined,
          publishedTime: post.published_at ?? undefined,
          images: post.hero_image_url ? [post.hero_image_url] : undefined,
        },
  }
}

// ─────────────────────────────────────────────────────────────────────
// /journal/[slug] — one article.
//
//   Hero: strand · date · title · author (· outlet for press)
//   Body (sanitized HTML produced at save time) · press: link to the original
//   Related event (when public) · email sign-up block
//
// Members' Editorial: only fetched for a signed-in active member. For
// anyone else the row is never read; if the slug isn't readable we show a
// generic locked page (it may be members-only, or may not exist) that
// reveals nothing about the article.
// ─────────────────────────────────────────────────────────────────────

const ARTICLE_CLASSES = [
  'font-[family-name:var(--font-editorial)] text-[clamp(1.125rem,1.4vw,1.375rem)] leading-[1.8] text-ivory',
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

export default async function JournalArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewer = await getJournalViewer()
  const post = await getJournalPost(slug, viewer.isMember)

  if (!post) {
    // Members can read everything published, so a miss is a real 404.
    if (viewer.isMember) notFound()
    return <LockedArticle />
  }

  const date = formatBlogDate(post.published_at)
  const isPress = post.strand === 'press'
  const byline = isPress
    ? post.outlet
    : post.author_name || (post.author_type === 'sarah' ? 'Sarah Restrick' : null)

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative min-h-[70vh] w-full always-night overflow-hidden bg-ink">
        {post.hero_image_url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.hero_image_url} alt={post.title} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-ink/55" />
            <div className="film-grain-night" />
          </>
        ) : (
          <Aurora variant="dusk" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-[55%] hero-fade-bottom pointer-events-none" />

        <div className="relative z-10 min-h-[70vh] max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pt-32 pb-20">
          <Reveal type="up" delay={0}>
            <Link
              href="/journal"
              className="self-start inline-flex items-center gap-2 mb-9 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory-soft hover:text-bronze-light transition-colors duration-300"
            >
              <ArrowLeft size={13} strokeWidth={1.5} />
              The Journal
            </Link>
          </Reveal>
          <Reveal type="up" delay={150}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
              {journalStrandLabel(post.strand)}
              {post.visibility === 'members' && <span className="text-ivory-soft"> · Members only</span>}
              {date && <span className="text-ivory-soft"> · {date}</span>}
            </p>
          </Reveal>
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
          {byline && (
            <Reveal type="up" delay={550}>
              <p className="mt-7 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-ivory">
                {isPress ? 'Published in ' : 'By '}
                <span className="text-bronze-light">{byline}</span>
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── Article ───────────────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        {/* One centred reading column — body, tags, related event and links. */}
        <article className="max-w-3xl mx-auto">
          {post.body_html.trim() && (
            <div className={ARTICLE_CLASSES} dangerouslySetInnerHTML={{ __html: post.body_html }} />
          )}
          {isPress && post.original_url && (
            <div className="mt-12">
              <Pill href={post.original_url} external variant="solid">
                Read the original{post.outlet ? ` in ${post.outlet}` : ''}
              </Pill>
            </div>
          )}
          {post.tags.length > 0 && (
            <ul className="mt-12 flex flex-wrap gap-2" aria-label="Tags">
              {post.tags.map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-graphite-line/70 px-3.5 py-1.5 font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.24em] text-ivory-soft"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
          {post.event && (
            <div className="mt-14 border-t border-graphite-line/50 pt-8">
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-4">
                Related event
              </p>
              <Link
                href={`/events/${post.event.slug}`}
                className="group inline-flex items-start gap-3 font-[family-name:var(--font-display)] text-[clamp(1.375rem,2.2vw,2rem)] leading-[1.2] text-ivory hover:text-bronze-light transition-colors duration-500"
              >
                {post.event.title}
                <ArrowUpRight size={18} strokeWidth={1.5} className="mt-1.5 shrink-0" />
              </Link>
            </div>
          )}
          <div className="mt-14 flex flex-wrap gap-x-8 gap-y-4">
            <MetaLink href="/journal">More from the Journal</MetaLink>
            <MetaLink href="/portfolio">See the portfolio</MetaLink>
          </div>
        </article>
      </Chapter>

      {/* ── Email sign-up (foot of every article) ─────────────── */}
      <section className="always-night relative overflow-hidden bg-graphite border-t border-graphite-line/40 py-20 lg:py-24">
        <Aurora variant="soft" />
        <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10">
          <JournalSignup />
        </div>
      </section>
    </>
  )
}

function LockedArticle() {
  return (
    <section className="relative min-h-[80vh] w-full always-night overflow-hidden bg-ink flex items-center">
      <Aurora variant="dusk" />
      <div className="relative z-10 max-w-2xl mx-auto px-6 lg:px-10 py-40 text-center">
        <div className="w-14 h-14 mx-auto rounded-full border border-bronze/40 bg-bronze/10 flex items-center justify-center mb-8">
          <Lock size={20} strokeWidth={1.5} className="text-bronze-light" />
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
          Members&rsquo; Editorial
        </p>
        <h1 className="display-md text-ivory">Members only &mdash; sign in.</h1>
        <p className="mt-6 font-[family-name:var(--font-editorial)] italic text-[clamp(1rem,1.2vw,1.15rem)] leading-[1.7] text-ivory-soft">
          This page is for The Club Members, or it is no longer available. Sign in to read
          Members&rsquo; Editorial, or explore the public Journal.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Pill href="/login" variant="solid">
            Sign in
          </Pill>
          <Pill href="/membership-application">Apply</Pill>
        </div>
        <div className="mt-8">
          <MetaLink href="/journal">The Journal</MetaLink>
        </div>
      </div>
    </section>
  )
}
