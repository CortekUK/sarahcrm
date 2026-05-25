'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  CalendarDays,
  User,
  Handshake,
  Users,
  CreditCard,
  LogOut,
  Menu,
  X,
} from 'lucide-react'

// Member portal shell — night/editorial vocabulary matching the public
// site (NightHeader / NightFooter). Same chrome motifs: graphite header
// on scroll, bronze hairline + dot accents, ivory wordmark, fullscreen
// mobile overlay. Functional logic (auth, sign out, active detection)
// is unchanged from the previous admin-themed shell — only the visual
// treatment is rebuilt.

const NAV_ITEMS = [
  { to: '/portal', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/portal/events', label: 'Events', icon: CalendarDays, end: false },
  { to: '/portal/introductions', label: 'Introductions', icon: Handshake, end: false },
  { to: '/portal/network', label: 'Network', icon: Users, end: false },
  { to: '/portal/billing', label: 'Billing', icon: CreditCard, end: false },
  { to: '/portal/profile', label: 'Profile', icon: User, end: false },
]

function PortalLayoutInner({ children }: { children: React.ReactNode }) {
  const { signOut, profile } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mobile overlay on route change
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

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

          {/* Desktop nav — centred editorial links with bronze dot
              active indicator. Icons sit before the label, smaller and
              quieter than they were in the admin shell so the row reads
              as type-led, not icon-led. */}
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
          </nav>

          {/* Right side — avatar + name + sign out (desktop), hamburger
              (mobile). The avatar links to the profile page; the sign
              out icon is a quiet ghost button on bronze-light hover. */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Link
              href="/portal/profile"
              className="hidden lg:flex items-center gap-3 pl-3 pr-4 py-1.5 rounded-full border border-graphite-line/60 hover:border-bronze/55 hover:bg-bronze/[0.04] transition-all duration-300 group"
              aria-label="Open profile"
            >
              <Avatar
                name={name || profile?.email || '?'}
                src={profile?.avatar_url}
                size="sm"
              />
              <span className="font-[family-name:var(--font-meta)] text-[10.5px] font-medium uppercase tracking-[0.22em] text-ivory/85 group-hover:text-bronze-light transition-colors">
                {name || 'Member'}
              </span>
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="hidden lg:inline-flex p-2.5 rounded-full text-ivory/65 hover:text-bronze-light hover:bg-bronze/[0.06] transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} strokeWidth={1.5} />
            </button>
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
          {NAV_ITEMS.map((item, i) => {
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
            style={{ transitionDelay: menuOpen ? `${NAV_ITEMS.length * 70 + 180}ms` : '0ms' }}
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
