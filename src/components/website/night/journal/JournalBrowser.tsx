'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  JOURNAL_STRANDS,
  journalStrandLabel,
  type JournalPostSummary,
  type JournalStrand,
} from '@/lib/cms/journal-shared'

// ─────────────────────────────────────────────────────────────────────
// Journal magazine — strand chips + cards.
//
// Signed-out visitors never receive Members' Editorial rows (the server
// doesn't fetch them). In their place they see ONE generic locked tile —
// no titles, no counts — with Sign in / Apply.
// ─────────────────────────────────────────────────────────────────────

type Filter = 'all' | JournalStrand

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Europe/London',
    }).format(new Date(iso))
  } catch {
    return null
  }
}

export function JournalBrowser({
  posts,
  isMember,
}: {
  posts: JournalPostSummary[]
  isMember: boolean
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const shown = useMemo(
    () => (filter === 'all' ? posts : posts.filter((p) => p.strand === filter)),
    [posts, filter],
  )

  // Locked tile for visitors: on "All" and on the Members' Editorial chip.
  const showLocked = !isMember && (filter === 'all' || filter === 'members')
  const [lead, ...rest] = shown

  return (
    <>
      <div className="mb-12 lg:mb-16 overflow-x-auto no-scrollbar -mx-2 px-2">
        <div className="flex flex-nowrap gap-2.5 lg:gap-3 w-max" role="group" aria-label="Filter the Journal">
          {[{ value: 'all' as Filter, label: 'All', membersOnly: false }, ...JOURNAL_STRANDS].map((s) => {
            const active = filter === s.value
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(s.value)}
                className={cn(
                  'shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-full border font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.26em] transition-all duration-300',
                  active
                    ? 'border-bronze bg-bronze/15 text-bronze-light'
                    : 'border-graphite-line/70 text-ivory-soft hover:border-bronze/60 hover:text-ivory',
                )}
              >
                {s.membersOnly && !isMember && <Lock size={11} strokeWidth={1.75} aria-hidden />}
                {s.label}
              </button>
            )
          })}
        </div>
      </div>

      {shown.length === 0 && !showLocked ? (
        <div className="border-t border-graphite-line/50 pt-12 max-w-xl">
          <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.125rem,1.4vw,1.375rem)] leading-[1.7] text-ivory-soft">
            {filter === 'all'
              ? 'First stories coming soon.'
              : `The first ${journalStrandLabel(filter)} ${filter === 'press' ? 'pieces are' : 'stories are'} coming soon.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {lead && <PostCard post={lead} lead />}
          {rest.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
          {showLocked && <LockedTile />}
        </div>
      )}
    </>
  )
}

function PostCard({ post, lead = false }: { post: JournalPostSummary; lead?: boolean }) {
  const date = fmtDate(post.published_at)
  const isPress = post.strand === 'press' && !!post.original_url
  const href = isPress ? post.original_url! : `/journal/${post.slug}`
  const byline =
    post.strand === 'press'
      ? post.outlet
      : post.author_name || (post.author_type === 'sarah' ? 'Sarah Restrick' : null)

  const body = (
    <>
      <div className={cn('relative overflow-hidden bg-graphite', lead ? 'aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[420px]' : 'aspect-[16/10]')}>
        {post.hero_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.hero_image_url}
            alt={post.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-graphite-2 to-plum/30">
            <span className="font-[family-name:var(--font-display)] text-7xl text-slate-dim">{post.title.charAt(0)}</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-6 lg:p-7">
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
          {journalStrandLabel(post.strand)}
          {date && <span className="text-slate-haze"> · {date}</span>}
        </p>
        <h3
          className={cn(
            'mt-3 font-[family-name:var(--font-display)] leading-[1.18] text-ivory',
            lead ? 'text-[clamp(1.5rem,2.4vw,2.25rem)]' : 'text-[22px]',
          )}
        >
          {post.title}
        </h3>
        {post.excerpt && (
          <p className="mt-3 flex-1 font-[family-name:var(--font-editorial)] text-[15px] leading-[1.65] text-ivory-soft line-clamp-4">
            {post.excerpt}
          </p>
        )}
        <div className="mt-6 flex items-center justify-between gap-4">
          <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.26em] text-slate-haze truncate">
            {byline}
          </span>
          <span className="inline-flex shrink-0 items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.3em] text-ivory group-hover:text-bronze-light transition-colors">
            {isPress ? 'Read the original' : 'Read'}
            <ArrowUpRight size={13} strokeWidth={1.5} />
          </span>
        </div>
      </div>
    </>
  )

  const cls = cn(
    'group flex flex-col border border-graphite-line/40 hover:border-bronze/55 transition-colors duration-500 bg-graphite-2 overflow-hidden',
    lead && 'md:col-span-2 lg:col-span-3 lg:grid lg:grid-cols-2',
  )

  return isPress ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  )
}

function LockedTile() {
  return (
    <div className="flex flex-col justify-between border border-dashed border-bronze/40 bg-graphite p-7 lg:p-8 min-h-[280px]">
      <div>
        <div className="w-11 h-11 rounded-full border border-bronze/40 bg-bronze/10 flex items-center justify-center mb-6">
          <Lock size={16} strokeWidth={1.5} className="text-bronze-light" />
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
          Members&rsquo; Editorial
        </p>
        <h3 className="mt-3 font-[family-name:var(--font-display)] text-[22px] leading-[1.2] text-ivory">
          Newsletters, member articles and news for The Club Members.
        </h3>
        <p className="mt-3 font-[family-name:var(--font-editorial)] italic text-[15px] text-ivory-soft">
          Members only &mdash; sign in to read.
        </p>
      </div>
      <div className="mt-8 flex flex-wrap gap-x-7 gap-y-3">
        <Link
          href="/login"
          className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.3em] text-bronze-light hover:text-ivory transition-colors"
        >
          Sign in <ArrowUpRight size={13} strokeWidth={1.5} />
        </Link>
        <Link
          href="/membership-application"
          className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.3em] text-ivory-soft hover:text-bronze-light transition-colors"
        >
          Apply <ArrowUpRight size={13} strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  )
}
