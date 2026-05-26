'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { Instagram, ArrowUpRight } from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { Reveal } from '../effects/Reveal'

// Editorial Instagram banner — admin-managed at /dashboard/website/instagram.
//
// Layout reads as a private members club profile card:
//   • Editorial eyebrow + headline up top
//   • A full-width profile card with the avatar on the left, identity
//     stack on the right (display name + verified tick, handle inline
//     with the follower count, bio underneath), and the Follow CTA
//     anchored to the right edge
//   • Tile grid sits dormant behind SHOW_TILES until cover-image
//     uploads or the Graph API integration are wired
//
// Client component on purpose — the membership-application page is
// client-rendered, and the public anon Supabase client suffices because
// public RLS policies allow anon SELECT on active rows. Always-fresh
// fetch on mount means admin edits show on the next page visit without
// any ISR cache window.

// Toggle for the tile grid. Flip to true once tile previews are
// reliable (uploaded covers OR Graph API). Until then the chapter
// shows the banner only — the tile rendering stays in code so
// re-enabling is a one-line change.
const SHOW_TILES = false

interface IgPost {
  id: string
  image_url: string | null
  caption: string | null
  post_url: string | null
}

interface IgSettings {
  handle: string | null
  display_name: string | null
  profile_url: string | null
  avatar_url: string | null
  bio: string | null
  follower_count: number | null
}

function formatFollowers(n: number | null): string | null {
  if (n == null || n <= 0) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toLocaleString('en-GB')
}

function normaliseHandle(h: string | null): string | null {
  if (!h) return null
  return h.startsWith('@') ? h : `@${h}`
}

// Verified mark — bronze burst + ink check. Brand-palette stand-in for
// IG's blue verified tick.
function VerifiedMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Verified"
      role="img"
      className="shrink-0"
    >
      <path
        d="M22.5 12c0-1.06-.55-2-1.4-2.53.4-.93.2-2.04-.55-2.78-.74-.74-1.85-.94-2.78-.55C17.24 5.3 16.3 4.75 15.24 4.75c-1.06 0-2 .55-2.53 1.4-.93-.4-2.04-.2-2.78.55-.74.74-.94 1.85-.55 2.78-.85.53-1.4 1.47-1.4 2.52 0 1.06.55 2 1.4 2.53-.4.93-.2 2.04.55 2.78.74.74 1.85.94 2.78.55.53.85 1.47 1.4 2.53 1.4 1.06 0 2-.55 2.53-1.4.93.4 2.04.2 2.78-.55.74-.74.94-1.85.55-2.78.85-.53 1.4-1.47 1.4-2.53Z"
        transform="translate(-3.24)"
        fill="var(--color-gold, #C09870)"
      />
      <path
        d="m8.4 12.3 2.3 2.3 4.4-4.7"
        stroke="#0E1014"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function InstagramChapter() {
  const [settings, setSettings] = useState<IgSettings | null>(null)
  const [posts, setPosts] = useState<IgPost[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [settingsRes, postsRes] = await Promise.all([
        supabase
          .from('instagram_settings')
          .select('handle, display_name, profile_url, avatar_url, bio, follower_count')
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('instagram_posts')
          .select('id, image_url, caption, post_url')
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .limit(9),
      ])
      if (cancelled) return
      setSettings((settingsRes.data as IgSettings | null) ?? null)
      setPosts((postsRes.data as IgPost[] | null) ?? [])
      setLoaded(true)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (!loaded) return null
  if (!settings && posts.length === 0) return null

  const handle = normaliseHandle(settings?.handle ?? null)
  const profileHref =
    settings?.profile_url ||
    (settings?.handle
      ? `https://instagram.com/${settings.handle.replace(/^@/, '')}`
      : 'https://instagram.com')
  const followerLabel = formatFollowers(settings?.follower_count ?? null)
  const tiles = posts.slice(0, 6)

  return (
    // Compact section padding — this is a quiet brand-presence beat
    // sandwiched between heavier surfaces (Story → Video on /about,
    // Hero → Browser on /events, Intro → Application on /membership-
    // application), so it needs much less vertical breathing than a
    // proper Chapter density would give.
    <section className="relative overflow-clip bg-ink py-12 md:py-16">
      <div className="max-w-6xl mx-auto px-6 lg:px-10">
        {/* ── Editorial title block ───────────────────────────── */}
        <div className="text-center mb-7 lg:mb-9">
          <Reveal type="up" delay={0}>
            <div className="inline-flex items-center gap-4 text-bronze-light">
              <span className="h-px w-10 bg-bronze/55" />
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em]">
                Follow Along
              </p>
              <span className="h-px w-10 bg-bronze/55" />
            </div>
          </Reveal>
          <Reveal type="clip" delay={150}>
            <h2 className="display-md mt-5 max-w-2xl mx-auto text-ivory">
              The story, day to day.
            </h2>
          </Reveal>
        </div>

        {/* ── Profile card ─────────────────────────────────────
            IG-style horizontal card: avatar on the left, identity
            stack centred, Follow CTA on the right. Followers reads
            inline with the handle so it never feels isolated. */}
        <Reveal type="up" delay={300}>
          <div className="border border-graphite-line/40 bg-graphite/30 backdrop-blur-sm px-6 lg:px-9 py-5 lg:py-6">
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-6 lg:gap-10 items-center">
              {/* Avatar — square, full image, no circular mask. Larger
                  than before so it has weight as the focal element. */}
              {settings?.avatar_url ? (
                <div className="relative w-20 h-20 lg:w-24 lg:h-24 shrink-0 mx-auto lg:mx-0">
                  <Image
                    src={settings.avatar_url}
                    alt={settings.display_name ?? handle ?? 'Instagram avatar'}
                    fill
                    sizes="96px"
                    className="object-contain"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 lg:w-24 lg:h-24 border border-bronze/55 bg-bronze/10 flex items-center justify-center shrink-0 mx-auto lg:mx-0">
                  <Instagram size={28} strokeWidth={1.5} className="text-bronze-light" />
                </div>
              )}

              {/* Identity stack — name + verified, handle · followers
                  on one line so the follower spec has context, bio
                  underneath. Centred on mobile, left-aligned from lg. */}
              <div className="min-w-0 text-center lg:text-left">
                {settings?.display_name && (
                  <p className="font-[family-name:var(--font-display)] text-[22px] lg:text-[26px] leading-tight text-ivory flex items-center gap-2.5 justify-center lg:justify-start">
                    <span className="truncate">{settings.display_name}</span>
                    <VerifiedMark size={20} />
                  </p>
                )}
                {(handle || followerLabel) && (
                  <div className="mt-2 flex items-center gap-3 justify-center lg:justify-start text-bronze-light">
                    {handle && (
                      <a
                        href={profileHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.3em] hover:text-ivory transition-colors duration-300"
                      >
                        {handle}
                      </a>
                    )}
                    {handle && followerLabel && (
                      <span aria-hidden className="h-1 w-1 rounded-full bg-bronze/60" />
                    )}
                    {followerLabel && (
                      <p className="font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.3em] text-slate-haze">
                        <span className="text-ivory tabular-nums">{followerLabel}</span> Followers
                      </p>
                    )}
                  </div>
                )}
                {settings?.bio && (
                  <p className="mt-4 font-[family-name:var(--font-editorial)] italic text-[14px] lg:text-[15px] leading-[1.6] text-ivory-soft max-w-xl mx-auto lg:mx-0">
                    {settings.bio}
                  </p>
                )}
              </div>

              {/* Follow CTA — premium double-stroke bronze pill */}
              <a
                href={profileHref}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center gap-2 justify-self-center lg:justify-self-end shrink-0"
              >
                <span className="relative block px-7 py-3 border border-bronze rounded-full overflow-hidden transition-colors duration-700">
                  <span
                    aria-hidden
                    className="absolute inset-[4px] border border-bronze/40 rounded-full pointer-events-none transition-colors duration-700 group-hover:border-ink/20"
                  />
                  <span
                    aria-hidden
                    className="absolute inset-[4px] bg-bronze rounded-full scale-x-0 group-hover:scale-x-100 origin-center transition-transform duration-700 ease-out"
                  />
                  <span className="relative z-10 flex items-center gap-2.5 font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.32em] text-ivory group-hover:text-ink transition-colors duration-700">
                    Follow on Instagram
                    <ArrowUpRight
                      size={13}
                      strokeWidth={1.5}
                      className="transition-transform duration-700 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </span>
                </span>
              </a>
            </div>
          </div>
        </Reveal>

        {/* ── Tile mosaic ─────────────────────────────────────
            Dormant by default — see SHOW_TILES at top of the file. */}
        {SHOW_TILES && (
          tiles.length > 0 ? (
            <div className="mt-12 lg:mt-16 grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
              {tiles.map((p, i) => (
                <Reveal key={p.id} type="up" delay={120 + i * 70}>
                  <InstagramTile post={p} fallbackHref={profileHref} />
                </Reveal>
              ))}
            </div>
          ) : (
            <div className="mt-12 lg:mt-16 border border-dashed border-graphite-line/60 px-6 py-20 text-center">
              <Instagram size={22} strokeWidth={1.5} className="mx-auto text-bronze-light/60" />
              <p className="mt-4 font-[family-name:var(--font-editorial)] italic text-[14px] text-ivory-soft">
                New posts will appear here.
              </p>
            </div>
          )
        )}
      </div>
    </section>
  )
}

// ─── Tile ──────────────────────────────────────────────────────────
//
// One Instagram tile. Two variants:
//   • Photo — square image, slow scale-on-hover, caption overlay.
//   • Link card (no image) — typographic graphite tile with IG glyph
//     + caption. Links to the IG post.

function InstagramTile({
  post,
  fallbackHref,
}: {
  post: IgPost
  fallbackHref: string
}) {
  const href = post.post_url || fallbackHref
  const hasImage = Boolean(post.image_url)

  const cornerBrackets = (
    <>
      <span aria-hidden className="absolute top-3 left-3 w-3 h-px bg-ivory/45 transition-opacity duration-500 opacity-0 group-hover:opacity-100" />
      <span aria-hidden className="absolute top-3 left-3 w-px h-3 bg-ivory/45 transition-opacity duration-500 opacity-0 group-hover:opacity-100" />
      <span aria-hidden className="absolute top-3 right-3 w-3 h-px bg-ivory/45 transition-opacity duration-500 opacity-0 group-hover:opacity-100" />
      <span aria-hidden className="absolute top-3 right-3 w-px h-3 bg-ivory/45 transition-opacity duration-500 opacity-0 group-hover:opacity-100" />
      <span aria-hidden className="absolute bottom-3 left-3 w-3 h-px bg-ivory/45 transition-opacity duration-500 opacity-0 group-hover:opacity-100" />
      <span aria-hidden className="absolute bottom-3 left-3 w-px h-3 bg-ivory/45 transition-opacity duration-500 opacity-0 group-hover:opacity-100" />
      <span aria-hidden className="absolute bottom-3 right-3 w-3 h-px bg-ivory/45 transition-opacity duration-500 opacity-0 group-hover:opacity-100" />
      <span aria-hidden className="absolute bottom-3 right-3 w-px h-3 bg-ivory/45 transition-opacity duration-500 opacity-0 group-hover:opacity-100" />
    </>
  )

  if (!hasImage) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={post.caption ?? 'Instagram post'}
        className="group relative block aspect-square overflow-hidden border border-graphite-line/40 hover:border-bronze/60 bg-graphite transition-colors duration-500"
      >
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-bronze/10 via-transparent to-plum/15 opacity-60 group-hover:opacity-100 transition-opacity duration-700"
        />
        {cornerBrackets}

        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-5">
          <div className="w-12 h-12 rounded-full border border-bronze/55 bg-ink/40 backdrop-blur-sm flex items-center justify-center transition-colors duration-500 group-hover:border-bronze">
            <Instagram size={18} strokeWidth={1.5} className="text-bronze-light" />
          </div>
          <p className="mt-5 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light">
            View Post
          </p>
          {post.caption && (
            <p className="mt-4 font-[family-name:var(--font-editorial)] italic text-[13px] leading-[1.55] text-ivory-soft line-clamp-3">
              {post.caption}
            </p>
          )}
        </div>
      </a>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={post.caption ?? 'Instagram post'}
      className="group relative block aspect-square overflow-hidden border border-graphite-line/40 hover:border-bronze/60 transition-colors duration-500"
    >
      <Image
        src={post.image_url!}
        alt={post.caption ?? 'Instagram'}
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px"
        className="object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-[1.06]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/0 to-transparent opacity-70 transition-opacity duration-700 group-hover:opacity-100" />
      {cornerBrackets}

      <div className="absolute top-4 right-4 w-7 h-7 rounded-full border border-ivory/30 bg-ink/30 backdrop-blur-sm flex items-center justify-center opacity-90 group-hover:border-bronze/60 group-hover:bg-ink/50 transition-colors duration-500">
        <Instagram size={12} strokeWidth={1.6} className="text-ivory" />
      </div>

      {post.caption && (
        <div className="absolute inset-x-0 bottom-0 p-4 lg:p-5 translate-y-1 group-hover:translate-y-0 transition-transform duration-500">
          <p className="font-[family-name:var(--font-editorial)] italic text-[13px] lg:text-[14px] leading-[1.55] text-ivory line-clamp-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
            {post.caption}
          </p>
        </div>
      )}
    </a>
  )
}
