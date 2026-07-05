'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { Avatar } from '@/components/ui/Avatar'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  CalendarDays,
  User,
  Handshake,
  Users,
  CreditCard,
  BellRing,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react'

// Member portal shell — night/editorial vocabulary matching the public
// site (NightHeader / NightFooter). Same chrome motifs: graphite header
// on scroll, bronze hairline + dot accents, ivory wordmark, fullscreen
// mobile overlay. Functional logic (auth, sign out, active detection)
// is unchanged from the previous admin-themed shell — only the visual
// treatment is rebuilt.

// Desktop primary nav — only the two most-used links sit in the bar.
// Introductions + Network fold into the Community dropdown below;
// Profile + Billing live in the user menu pill on the right. This keeps
// the header from overflowing on a member with a long name.
const NAV_ITEMS: { to: string; label: string; icon: typeof LayoutDashboard; end: boolean }[] = [
  { to: '/portal', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/portal/events', label: 'Events', icon: CalendarDays, end: false },
  { to: '/portal/concierge', label: 'Concierge', icon: BellRing, end: false },
]

const COMMUNITY_ITEMS: { to: string; label: string; icon: typeof LayoutDashboard; description: string }[] = [
  {
    to: '/portal/introductions',
    label: 'Introductions',
    icon: Handshake,
    description: 'Your curated matches and suggestions.',
  },
  {
    to: '/portal/network',
    label: 'Network',
    icon: Users,
    description: 'Members across Manchester, Leeds and London.',
  },
]

// Mobile overlay — everything in one flat list since space allows it there.
const MOBILE_NAV_ITEMS = [
  ...NAV_ITEMS,
  ...COMMUNITY_ITEMS.map((c) => ({ to: c.to, label: c.label, icon: c.icon, end: false })),
  { to: '/portal/billing', label: 'Billing', icon: CreditCard, end: false },
  { to: '/portal/profile', label: 'Profile', icon: User, end: false },
]

function PortalLayoutInner({ children }: { children: React.ReactNode }) {
  const { signOut, profile } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const [communityOpen, setCommunityOpen] = useState(false)
  const communityRef = useRef<HTMLDivElement>(null)
  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mobile overlay + dropdowns on route change
  useEffect(() => {
    setMenuOpen(false)
    setUserMenuOpen(false)
    setCommunityOpen(false)
  }, [pathname])

  // Outside-click + Escape close both desktop dropdowns. We handle them
  // together because they share the same closing semantics — escape on
  // either menu should close whichever is open.
  useEffect(() => {
    if (!userMenuOpen && !communityOpen) return
    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false)
      }
      if (communityOpen && communityRef.current && !communityRef.current.contains(target)) {
        setCommunityOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setUserMenuOpen(false)
        setCommunityOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [userMenuOpen, communityOpen])

  // Body scroll lock while overlay is open
  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  function isActive(to: string, end: boolean) {
    if (end) return pathname === to
    return pathname.startsWith(to)
  }

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  return (
    <div className="min-h-screen bg-ink text-ivory flex flex-col">
      {/* ── Header ────────────────────────────────────────────────── */}
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-[background,backdrop-filter,border-color] duration-500',
          scrolled
            ? 'bg-graphite/85 backdrop-blur-md border-b border-graphite-line/60'
            : 'bg-ink/60 backdrop-blur-sm border-b border-graphite-line/30',
        )}
      >
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 h-[72px] flex items-center justify-between gap-6">
          {/* Wordmark */}
          <Link
            href="/portal"
            className="group flex items-center gap-3 leading-none shrink-0"
            aria-label="The Club — Member portal"
          >
            <Image
              src="/logo-white.png"
              alt=""
              width={40}
              height={40}
              priority
              className="h-10 w-10 opacity-90 group-hover:opacity-100 transition-opacity"
            />
            <span className="hidden sm:flex flex-col leading-none">
              <span className="font-[family-name:var(--font-display)] text-[20px] tracking-[0.02em] text-ivory transition-colors duration-500 group-hover:text-bronze-light">
                The Club
              </span>
              <span
                className={cn(
                  'font-[family-name:var(--font-meta)] text-[9px] font-medium uppercase tracking-[0.32em] mt-[3px] transition-colors duration-600 ease-out',
                  scrolled ? 'text-bronze-light' : 'text-slate-haze',
                )}
              >
                Member Portal
              </span>
            </span>
          </Link>

          {/* Desktop nav — Dashboard + Events stay primary; Introductions
              + Network fold into a 'Community' dropdown to stop the
              header overflowing on members with a long name. Bronze dot
              under the active link is preserved across both kinds. */}
          <nav className="hidden lg:flex items-center gap-7 flex-1 justify-center">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.to, item.end)
              return (
                <Link
                  key={item.to}
                  href={item.to}
                  className={cn(
                    'group relative inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.22em] transition-colors',
                    active ? 'text-bronze-light' : 'text-ivory/75 hover:text-ivory',
                  )}
                >
                  <item.icon
                    size={13}
                    strokeWidth={1.5}
                    className={cn(
                      'transition-colors',
                      active ? 'text-bronze-light' : 'text-ivory/55 group-hover:text-ivory/80',
                    )}
                  />
                  <span>{item.label}</span>
                  <span
                    aria-hidden
                    className={cn(
                      'absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-bronze transition-opacity duration-300',
                      active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                  />
                </Link>
              )
            })}

            {/* Community group — Introductions + Network */}
            <div ref={communityRef} className="relative">
              {(() => {
                const communityActive = COMMUNITY_ITEMS.some((c) => pathname.startsWith(c.to))
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setCommunityOpen((v) => !v)}
                      aria-haspopup="menu"
                      aria-expanded={communityOpen}
                      className={cn(
                        'group relative inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.22em] transition-colors',
                        communityActive || communityOpen
                          ? 'text-bronze-light'
                          : 'text-ivory/75 hover:text-ivory',
                      )}
                    >
                      <Users
                        size={13}
                        strokeWidth={1.5}
                        className={cn(
                          'transition-colors',
                          communityActive || communityOpen
                            ? 'text-bronze-light'
                            : 'text-ivory/55 group-hover:text-ivory/80',
                        )}
                      />
                      <span>Community</span>
                      <ChevronDown
                        size={11}
                        strokeWidth={1.7}
                        className={cn(
                          'transition-all duration-300',
                          communityOpen ? 'rotate-180 text-bronze-light' : 'text-ivory/45 group-hover:text-ivory/70',
                        )}
                      />
                      <span
                        aria-hidden
                        className={cn(
                          'absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-bronze transition-opacity duration-300',
                          communityActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                        )}
                      />
                    </button>

                    {communityOpen && (
                      <div
                        role="menu"
                        className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+18px)] w-72 bg-graphite-2 border border-graphite-line/70 shadow-[0_18px_40px_rgba(0,0,0,0.55)] day:shadow-[0_18px_40px_rgba(60,40,20,0.18)] rounded-md py-2 z-50"
                      >
                        {COMMUNITY_ITEMS.map((item) => {
                          const itemActive = pathname.startsWith(item.to)
                          return (
                            <Link
                              key={item.to}
                              href={item.to}
                              role="menuitem"
                              onClick={() => setCommunityOpen(false)}
                              className={cn(
                                'flex items-start gap-3 px-4 py-3 transition-colors',
                                itemActive
                                  ? 'bg-bronze/[0.08]'
                                  : 'hover:bg-bronze/[0.06]',
                              )}
                            >
                              <span
                                className={cn(
                                  'mt-0.5 w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-colors',
                                  itemActive
                                    ? 'border-bronze/60 bg-bronze/15 text-bronze-light'
                                    : 'border-graphite-line/60 text-ivory/65',
                                )}
                              >
                                <item.icon size={14} strokeWidth={1.6} />
                              </span>
                              <div className="min-w-0">
                                <p
                                  className={cn(
                                    'font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.22em] leading-tight',
                                    itemActive ? 'text-bronze-light' : 'text-ivory',
                                  )}
                                >
                                  {item.label}
                                </p>
                                <p className="mt-1 font-[family-name:var(--font-editorial)] italic text-[12px] text-ivory/60 leading-snug">
                                  {item.description}
                                </p>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </nav>

          {/* Right side — desktop: theme toggle + user-menu pill that
              opens a dropdown with profile link, account info and a
              clearly-labelled "Sign out". Mobile: hamburger. The icon-
              only logout we had before was too easy to miss; folding
              it into a labelled dropdown makes the flow discoverable. */}
          <div className="flex items-center gap-2.5 shrink-0">
            <ThemeToggle variant="icon" className="hidden lg:inline-flex" />

            <div ref={userMenuRef} className="hidden lg:block relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                className={cn(
                  'flex items-center gap-3 pl-3 pr-3 py-1.5 rounded-full border transition-all duration-300 group',
                  userMenuOpen
                    ? 'border-bronze/60 bg-bronze/[0.06]'
                    : 'border-graphite-line/60 hover:border-bronze/55 hover:bg-bronze/[0.04]',
                )}
              >
                <Avatar
                  name={name || profile?.email || '?'}
                  src={profile?.avatar_url}
                  size="sm"
                />
                <span
                  className={cn(
                    'font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.22em] transition-colors',
                    userMenuOpen ? 'text-bronze-light' : 'text-ivory/85 group-hover:text-bronze-light',
                  )}
                >
                  {name || 'Member'}
                </span>
                <ChevronDown
                  size={12}
                  strokeWidth={1.7}
                  className={cn(
                    'transition-all duration-300',
                    userMenuOpen ? 'rotate-180 text-bronze-light' : 'text-ivory/55 group-hover:text-bronze-light',
                  )}
                />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+10px)] w-64 bg-graphite-2 border border-graphite-line/70 shadow-[0_18px_40px_rgba(0,0,0,0.55)] day:shadow-[0_18px_40px_rgba(60,40,20,0.18)] rounded-md py-2 z-50"
                >
                  {/* Identity header — name + email so a member knows
                      which account they're signed into. */}
                  <div className="px-4 py-3 border-b border-graphite-line/40">
                    <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-bronze-light mb-1">
                      Signed in
                    </p>
                    <p className="text-[13px] text-ivory truncate">
                      {name || 'Member'}
                    </p>
                    {profile?.email && (
                      <p className="text-[11px] text-ivory/55 truncate mt-0.5">
                        {profile.email}
                      </p>
                    )}
                  </div>

                  <div className="py-1">
                    <Link
                      href="/portal/profile"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-ivory/85 hover:text-bronze-light hover:bg-bronze/[0.08] transition-colors"
                    >
                      <User size={14} strokeWidth={1.6} />
                      View profile
                    </Link>
                    <Link
                      href="/portal/billing"
                      role="menuitem"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-ivory/85 hover:text-bronze-light hover:bg-bronze/[0.08] transition-colors"
                    >
                      <CreditCard size={14} strokeWidth={1.6} />
                      Billing
                    </Link>
                  </div>

                  <div className="border-t border-graphite-line/40 pt-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setUserMenuOpen(false)
                        handleSignOut()
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-ivory/85 hover:text-accent-warm hover:bg-accent-warm/[0.08] transition-colors text-left"
                    >
                      <LogOut size={14} strokeWidth={1.6} />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="lg:hidden p-2 -mr-2 text-ivory hover:text-bronze-light transition-colors"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              {menuOpen ? <X size={20} strokeWidth={1.5} /> : <Menu size={20} strokeWidth={1.5} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile fullscreen overlay — mirrors NightHeader's pattern.
          Nav rows are large editorial type, staggered in. Avatar +
          sign out sit at the foot of the overlay. */}
      <div
        className={cn(
          'fixed inset-0 z-40 lg:hidden bg-ink transition-all duration-500',
          menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
      >
        <div className="h-full flex flex-col items-center justify-center gap-6 px-6 pt-20 pb-12">
          {MOBILE_NAV_ITEMS.map((item, i) => {
            const active = isActive(item.to, item.end)
            return (
              <Link
                key={item.to}
                href={item.to}
                className={cn(
                  'group inline-flex items-center gap-3 font-[family-name:var(--font-display)] text-2xl transition-all duration-500',
                  active ? 'text-bronze-light' : 'text-ivory/85 hover:text-bronze-light',
                  menuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
                )}
                style={{ transitionDelay: menuOpen ? `${i * 70 + 120}ms` : '0ms' }}
              >
                <item.icon size={18} strokeWidth={1.5} className="opacity-70" />
                {item.label}
                {active && (
                  <span
                    aria-hidden
                    className="w-1.5 h-1.5 rounded-full bg-bronze ml-1"
                  />
                )}
              </Link>
            )
          })}

          {/* Profile + sign out — staggered last */}
          <div
            className={cn(
              'mt-8 flex flex-col items-center gap-5 pt-8 border-t border-graphite-line/40 w-full max-w-xs transition-all duration-500',
              menuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4',
            )}
            style={{ transitionDelay: menuOpen ? `${MOBILE_NAV_ITEMS.length * 70 + 180}ms` : '0ms' }}
          >
            <Link
              href="/portal/profile"
              className="flex items-center gap-3"
            >
              <Avatar
                name={name || profile?.email || '?'}
                src={profile?.avatar_url}
                size="sm"
              />
              <span className="font-[family-name:var(--font-meta)] text-[11px] font-medium uppercase tracking-[0.28em] text-ivory/85">
                {name || 'Member'}
              </span>
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 px-7 py-3 border border-graphite-line/70 hover:border-bronze/60 rounded-full font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.28em] text-ivory/85 hover:text-bronze-light hover:bg-bronze/[0.05] transition-all duration-300"
            >
              <LogOut size={13} strokeWidth={1.5} />
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      {/* pt-[72px] reserves space under the fixed header so page
          content never sits underneath it. flex-1 lets the footer
          stick to the bottom on short pages. */}
      <main className="flex-1 pt-[72px]">{children}</main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-graphite-line/60 bg-ink">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-7 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-haze">
            © {new Date().getFullYear()} The Club by Sarah Restrick · Member Portal
          </p>
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-dim">
            Held in confidence
          </p>
        </div>
      </footer>
    </div>
  )
}

export default function PortalGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <PortalLayoutInner>{children}</PortalLayoutInner>
    </AuthProvider>
  )
}
