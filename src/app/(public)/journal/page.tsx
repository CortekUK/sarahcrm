import type { Metadata } from 'next'
import { Chapter } from '@/components/website/night/primitives/Chapter'
import { Aurora } from '@/components/website/night/effects/Aurora'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { JournalBrowser } from '@/components/website/night/journal/JournalBrowser'
import { JournalSignup } from '@/components/website/night/journal/JournalSignup'
import { MetaLink } from '@/components/website/night/portfolio/Pill'
import { getJournalViewer, listJournalPosts } from '@/lib/cms/blog'

const TITLE = 'The Journal | The Club by Sarah Restrick'
const DESCRIPTION =
  "The Journal from The Club: press coverage, founder's letters from Sarah Restrick, and stories from our events, PITCH founders and partners."

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/journal' },
  openGraph: { title: TITLE, description: DESCRIPTION },
}

// Per-request: a signed-in member also sees Members' Editorial.
export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────
// /journal — the magazine. Three public strands (Press, Founder's
// Letters, Stories) and one members-only strand (Members' Editorial).
//
// Signed-out visitors: only public rows are fetched (anon client +
// visibility filter + RLS); Members' Editorial appears as one generic
// locked tile, never as titles. Signed-in active members see everything
// and can submit an article for Sarah's approval.
// ─────────────────────────────────────────────────────────────────────

export default async function JournalPage() {
  const viewer = await getJournalViewer()
  const posts = await listJournalPosts(viewer)
  const empty = posts.length === 0

  return (
    <>
      {/* ── 01 · Hero (existing copy) ─────────────────────────── */}
      <section className="relative w-full always-night overflow-hidden bg-ink">
        <Aurora variant="dusk" />
        <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10 pt-44 pb-16 lg:pt-52 lg:pb-20">
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
          {viewer.isMember && (
            <Reveal type="up" delay={550}>
              <div className="mt-8">
                <MetaLink href="/portal/journal/submit">Submit an article</MetaLink>
              </div>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── 02 · Magazine ─────────────────────────────────────── */}
      <Chapter density="tight" bg="ink">
        <div className="max-w-[1400px] mx-auto">
          {empty && viewer.isMember ? (
            <div className="border-t border-graphite-line/50 pt-12 max-w-xl">
              <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.125rem,1.4vw,1.375rem)] leading-[1.7] text-ivory-soft">
                First stories coming soon.
              </p>
            </div>
          ) : (
            <>
              {empty && (
                <Reveal type="up" delay={0}>
                  <p className="mb-10 font-[family-name:var(--font-editorial)] italic text-[clamp(1.125rem,1.4vw,1.375rem)] leading-[1.7] text-ivory-soft max-w-xl">
                    First stories coming soon. Sign up below and we&rsquo;ll send them to you.
                  </p>
                </Reveal>
              )}
              <JournalBrowser posts={posts} isMember={viewer.isMember} />
            </>
          )}
        </div>
      </Chapter>

      {/* ── 03 · Sign-up ──────────────────────────────────────── */}
      <section className="always-night relative overflow-hidden bg-graphite border-t border-graphite-line/40 py-20 lg:py-24">
        <Aurora variant="soft" />
        <div className="relative z-10 max-w-[1400px] mx-auto px-6 lg:px-10">
          <JournalSignup />
        </div>
      </section>
    </>
  )
}
