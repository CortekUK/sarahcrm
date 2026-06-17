'use client'

import { Suspense, useEffect, useState, type ComponentType } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { QueryProvider } from '@/providers/QueryProvider'
import { useTheme } from '@/providers/ThemeProvider'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Toaster } from '@/components/ui-shadcn/toaster'
import { ConfirmDialogProvider } from '@/components/admin/ConfirmDialog'
import { ProgressProvider } from '@/components/admin/TopProgressBar'
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Mail,
  Inbox,
  MailPlus,
  Quote,
  PoundSterling,
  Globe,
  ChevronDown,
  Settings,
  LogOut,
  Sparkles,
  Send,
  Ticket,
  ClipboardList,
  Search,
  Zap,
  Tags,
  Handshake,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase/client'

// ── Pending counters ──────────────────────────────────────
// Counts of items needing admin attention, keyed by nav `to` so the
// sidebar can show a badge. Light, head-only count queries; refreshed
// on mount and when the route changes.
function useNavCounts(pathname: string): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [apps, bookings, overdue] = await Promise.all([
        supabase
          .from('membership_applications')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('payments')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'overdue'),
      ])
      if (cancelled) return
      setCounts({
        '/dashboard/applications': apps.count ?? 0,
        '/dashboard/bookings': bookings.count ?? 0,
        '/dashboard/finance': overdue.count ?? 0,
      })
    }
    load()
    return () => {
      cancelled = true
    }
    // Re-fetch when navigating (e.g. after approving an application the
    // badge should drop) — pathname is the cheap trigger.
  }, [pathname])

  return counts
}

// ── Nav model ─────────────────────────────────────────────
// Grouped into sections so the sidebar can render visible category labels
// (MAIN / ENGAGE / SITE) — the user wanted a less flat hierarchy.

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
}

interface NavGroup {
  to: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  children: { to: string; label: string; icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }[]
}

interface NavSection {
  label: string
  items: (NavItem | NavGroup)[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/dashboard/members', label: 'Members', icon: Users },
      { to: '/dashboard/applications', label: 'Applications', icon: ClipboardList },
      { to: '/dashboard/events', label: 'Events', icon: CalendarDays },
      { to: '/dashboard/bookings', label: 'Bookings', icon: Ticket },
      { to: '/dashboard/introductions', label: 'Introductions', icon: Handshake },
      { to: '/dashboard/tags', label: 'Tags', icon: Tags },
    ],
  },
  {
    label: 'Engage',
    items: [
      { to: '/dashboard/enquiries', label: 'Enquiries', icon: Inbox },
      { to: '/dashboard/reviews', label: 'Reviews', icon: Quote },
      { to: '/dashboard/newsletter', label: 'Newsletter', icon: MailPlus },
      {
        to: '/dashboard/communications',
        label: 'Communications',
        icon: Mail,
        children: [
          { to: '/dashboard/communications', label: 'Overview', icon: Send },
          { to: '/dashboard/communications/templates', label: 'AI Templates', icon: Sparkles },
          { to: '/dashboard/communications/log', label: 'Sent mail', icon: Mail },
        ],
      },
      { to: '/dashboard/finance', label: 'Finance', icon: PoundSterling },
      { to: '/dashboard/automations', label: 'Automations', icon: Zap },
    ],
  },
  {
    label: 'Site',
    items: [
      {
        to: '/dashboard/website',
        label: 'Website',
        icon: Globe,
        children: [
          { to: '/dashboard/website/memberships', label: 'Membership Plans' },
          { to: '/dashboard/website/membership-benefits', label: 'Membership Benefits' },
          { to: '/dashboard/website/membership-comparison', label: 'Membership Comparison' },
          { to: '/dashboard/website/galleries', label: 'Galleries' },
          { to: '/dashboard/website/hero-slides', label: 'Hero Slides' },
          { to: '/dashboard/website/testimonials', label: 'Testimonials' },
          { to: '/dashboard/website/instagram', label: 'Instagram' },
          // Past-highlight showcase tiles for the Private Events page.
          // Real bookable private events are managed under Events with
          // event_type = curated_luxury, not here.
          { to: '/dashboard/website/experiences', label: 'Past Highlights' },
          { to: '/dashboard/website/videos', label: 'Videos' },
          // Hidden for now (routes still work via direct URL):
          //   { to: '/dashboard/website/partners', label: 'Partners' },
          //   { to: '/dashboard/website/documents', label: 'Documents' },
        ],
      },
    ],
  },
]

function isNavGroup(item: NavItem | NavGroup): item is NavGroup {
  return 'children' in item
}

// Flattened leaf list used by the sidebar search. Group children inherit
// their parent's icon when they don't declare their own, so filtered
// results still read with a consistent glyph.
const FLAT_NAV: NavItem[] = NAV_SECTIONS.flatMap((section) =>
  section.items.flatMap((item) =>
    isNavGroup(item)
      ? [
          { to: item.to, label: item.label, icon: item.icon },
          ...item.children.map((c) => ({
            to: c.to,
            label: c.label,
            icon: c.icon ?? item.icon,
          })),
        ]
      : [{ to: item.to, label: item.label, icon: item.icon }],
  ),
)

function NavLink({
  to,
  label,
  Icon,
  active,
  badge,
  highlight,
}: {
  to: string
  label: string
  Icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>
  active: boolean
  badge?: string
  highlight?: boolean
}) {
  return (
    <Link
      href={to}
      className={cn(
        'group relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-[var(--radius-md)] text-[13.5px] transition-colors duration-200',
        active
          ? 'text-[var(--color-ivory)] font-medium bg-[var(--color-bronze)]/[0.10]'
          : 'text-[var(--color-ivory-soft)] hover:text-[var(--color-ivory)] hover:bg-[var(--color-ivory)]/[0.04]',
      )}
    >
      {/* Single, quiet active marker — a gold spine. No ring/shadow stack. */}
      <span
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] rounded-r-full bg-[var(--color-gold)] transition-all duration-200',
          active ? 'h-5 opacity-100' : 'h-0 opacity-0',
        )}
      />
      <Icon
        size={17}
        strokeWidth={1.6}
        className={cn(
          'shrink-0 transition-colors',
          active
            ? 'text-[var(--color-gold)]'
            : 'text-[var(--color-slate-haze)] group-hover:text-[var(--color-bronze-light)]',
          highlight && !active && 'text-[var(--color-gold)]',
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="text-[9px] font-medium uppercase tracking-[0.1em] px-1.5 py-0.5 rounded-full bg-[var(--color-gold)]/15 text-[var(--color-gold-dark)]">
          {badge}
        </span>
      )}
    </Link>
  )
}

function NavGroupRow({
  group,
  pathname,
}: {
  group: NavGroup
  pathname: string
}) {
  const isAnyChildActive = group.children.some((c) =>
    c.to === '/dashboard/communications'
      ? pathname === c.to
      : pathname.startsWith(c.to),
  )
  const isGroupActive = pathname.startsWith(group.to) && !isAnyChildActive
  const isActive = isAnyChildActive || isGroupActive
  const [expanded, setExpanded] = useState(isActive)
  const Icon = group.icon

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'group relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-[var(--radius-md)] text-[13.5px] w-full transition-colors duration-200',
          isActive
            ? 'text-[var(--color-ivory)] font-medium bg-[var(--color-bronze)]/[0.10]'
            : 'text-[var(--color-ivory-soft)] hover:text-[var(--color-ivory)] hover:bg-[var(--color-ivory)]/[0.04]',
        )}
      >
        <span
          className={cn(
            'absolute left-0 top-1/2 -translate-y-1/2 w-[2.5px] rounded-r-full bg-[var(--color-gold)] transition-all duration-200',
            isActive ? 'h-5 opacity-100' : 'h-0 opacity-0',
          )}
        />
        <Icon
          size={17}
          strokeWidth={1.6}
          className={cn(
            'shrink-0 transition-colors',
            isActive
              ? 'text-[var(--color-gold)]'
              : 'text-[var(--color-slate-haze)] group-hover:text-[var(--color-bronze-light)]',
          )}
        />
        <span className="flex-1 text-left truncate">{group.label}</span>
        <ChevronDown
          size={13}
          strokeWidth={1.8}
          className={cn(
            'shrink-0 transition-transform duration-200',
            isActive ? 'text-[var(--color-bronze-light)]' : 'text-[var(--color-text-dim)]',
            expanded && 'rotate-180',
          )}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200 ease-out',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="ml-4 mt-0.5 pl-3 space-y-0.5 border-l border-[var(--color-border)]/60">
            {group.children.map((child) => {
              const childActive =
                child.to === group.to
                  ? pathname === child.to
                  : pathname.startsWith(child.to) && pathname !== group.to
              const ChildIcon = child.icon
              const isAi = child.to.includes('/templates')
              return (
                <Link
                  key={child.to}
                  href={child.to}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-[13px] transition-colors',
                    childActive
                      ? 'text-[var(--color-bronze-light)] font-medium bg-[var(--color-bronze)]/[0.12]'
                      : 'text-[var(--color-slate-haze)] hover:text-[var(--color-ivory)] hover:bg-[var(--color-ivory)]/[0.04]',
                  )}
                >
                  {ChildIcon && (
                    <ChildIcon
                      size={13}
                      strokeWidth={1.7}
                      className={cn(
                        childActive
                          ? 'text-[var(--color-gold)]'
                          : isAi
                            ? 'text-[var(--color-gold)]/70'
                            : 'text-[var(--color-text-dim)]',
                      )}
                    />
                  )}
                  <span className="flex-1 truncate">{child.label}</span>
                  {isAi && (
                    <span className="text-[9px] font-medium uppercase tracking-[0.1em] text-[var(--color-gold)]">
                      AI
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const { signOut, profile } = useAuth()
  const { theme } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const [query, setQuery] = useState('')
  const navCounts = useNavCounts(pathname)

  const trimmedQuery = query.trim().toLowerCase()
  const filteredNav = trimmedQuery
    ? FLAT_NAV.filter((item) => item.label.toLowerCase().includes(trimmedQuery))
    : []

  async function handleSignOut() {
    await signOut()
    router.replace('/admin/login')
  }

  // `theme-night-admin` re-maps the cream/gold tokens to the night
  // palette. In day mode we drop it so the admin shell falls back to
  // the default cream + gold tokens defined in @theme. The night
  // palette tokens are still remapped to cream by `.theme-day` on
  // <html>, so any direct uses of bg-ink/text-ivory inside admin pages
  // also flip correctly.
  const themeClass = theme === 'day' ? '' : 'theme-night-admin'

  return (
    <div className={cn('min-h-screen bg-[var(--color-bg)] flex', themeClass)}>
      {/* Sidebar — graphite spine. The vertical gradient (graphite-3 top
          → graphite bottom) reads as a soft elevation against the ink
          main canvas. Right border is a single bronze-tinted hairline. */}
      <aside
        className="fixed left-0 top-0 bottom-0 w-[244px] flex flex-col z-40 border-r border-[var(--color-border)]"
        style={{
          background:
            'linear-gradient(180deg, var(--color-graphite-3) 0%, var(--color-graphite) 100%)',
        }}
      >
        {/* Brand header — diamond-C monogram + serif wordmark. Uses the
            display serif (same as the public site) so the admin shell
            reads as the same brand, not a separate dashboard skin. */}
        <div className="px-6 pt-7 pb-6">
          <div className="flex items-center gap-3">
            <Image
              src="/logo-gold.png"
              alt=""
              width={38}
              height={38}
              priority
              className="w-[38px] h-[38px] object-contain shrink-0"
            />
            <div className="min-w-0">
              <h1 className="font-[family-name:var(--font-display)] text-[19px] text-[var(--color-ivory)] leading-none tracking-[0.01em]">
                The Club
              </h1>
              <p className="font-[family-name:var(--font-label)] text-[8.5px] font-medium uppercase tracking-[0.28em] text-[var(--color-bronze-light)] mt-1.5">
                by Sarah Restrick
              </p>
            </div>
          </div>
        </div>

        {/* Quiet search — filters the nav. A subtle command-bar touch
            that keeps a long nav navigable without leaving the sidebar. */}
        <div className="px-4 pb-4">
          <div className="relative">
            <Search
              size={14}
              strokeWidth={1.7}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] pointer-events-none"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full pl-9 pr-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-ivory)]/[0.04] border border-[var(--color-border)]/70 text-[13px] text-[var(--color-ivory)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-bronze)]/50 focus:bg-[var(--color-ivory)]/[0.06] transition-colors"
            />
          </div>
        </div>

        <div className="h-px bg-[var(--color-border)]/60 mx-5" />

        {/* Nav — grouped with section labels, or a flat filtered list
            while searching. */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {trimmedQuery ? (
            filteredNav.length > 0 ? (
              <div className="space-y-0.5">
                {filteredNav.map((item) => {
                  const active =
                    item.to === '/dashboard'
                      ? pathname === '/dashboard'
                      : pathname.startsWith(item.to)
                  const count = navCounts[item.to]
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      label={item.label}
                      Icon={item.icon}
                      active={active}
                      badge={count && count > 0 ? String(count) : undefined}
                    />
                  )
                })}
              </div>
            ) : (
              <p className="px-4 py-3 text-[13px] text-[var(--color-text-dim)] italic">
                No matches for “{query.trim()}”.
              </p>
            )
          ) : (
            NAV_SECTIONS.map((section, idx) => (
              <div key={section.label} className={idx > 0 ? 'mt-6' : ''}>
                <p className="px-4 mb-2 text-[9.5px] font-medium uppercase tracking-[0.26em] text-[var(--color-text-dim)]">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    if (isNavGroup(item)) {
                      return <NavGroupRow key={item.to} group={item} pathname={pathname} />
                    }
                    const active =
                      item.to === '/dashboard'
                        ? pathname === '/dashboard'
                        : pathname.startsWith(item.to)
                    const count = navCounts[item.to]
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        label={item.label}
                        Icon={item.icon}
                        active={active}
                        badge={count && count > 0 ? String(count) : undefined}
                      />
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </nav>

        {/* Footer — profile, settings, signout */}
        <div className="border-t border-[var(--color-border)]/60 px-3 py-3 space-y-0.5">
          {profile && (
            <div className="flex items-center gap-3 px-3 py-2.5 mb-1">
              <div className="w-9 h-9 rounded-full bg-[var(--color-bronze)]/15 ring-1 ring-[var(--color-bronze)]/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={profile.first_name ?? 'profile'}
                    width={32}
                    height={32}
                    className="object-cover"
                  />
                ) : (
                  <span className="font-[family-name:var(--font-heading)] text-[var(--color-bronze-light)] text-sm font-semibold">
                    {(profile.first_name?.[0] ?? '?').toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[var(--color-ivory)] truncate leading-tight">
                  {profile.first_name} {profile.last_name}
                </p>
                <p className="text-[11px] text-[var(--color-slate-haze)] truncate">
                  {profile.email}
                </p>
              </div>
            </div>
          )}
          <NavLink
            to="/dashboard/settings"
            label="Settings"
            Icon={Settings}
            active={pathname.startsWith('/dashboard/settings')}
          />
          <div className="flex items-center gap-1">
            <button
              onClick={handleSignOut}
              className="group flex flex-1 items-center gap-3 pl-4 pr-3 py-2.5 rounded-[var(--radius-md)] text-[13.5px] text-[var(--color-ivory-soft)] hover:text-[var(--color-accent-warm)] hover:bg-[var(--color-accent-warm)]/[0.08] transition-colors"
            >
              <LogOut
                size={17}
                strokeWidth={1.6}
                className="text-[var(--color-slate-haze)] group-hover:text-[var(--color-accent-warm)] transition-colors"
              />
              <span>Sign out</span>
            </button>
            <ThemeToggle variant="icon" />
          </div>
        </div>
      </aside>

      {/* Main content.
          `min-w-0 overflow-x-hidden` is critical — without it, the flex
          item's default min-width: auto sizes it to its content's
          intrinsic width. If any page contains a wide table, <main>
          grows to fit and pushes the body wider, producing a horizontal
          scrollbar on the entire window. Constrain here; let individual
          scroll containers (e.g. the Table component) handle their own
          overflow. */}
      <main className="ml-[244px] flex-1 min-w-0 overflow-x-hidden min-h-screen">{children}</main>
    </div>
  )
}

export default function AdminGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <QueryProvider>
        {/* Suspense is required because ProgressProvider reads
            useSearchParams() to fire the bar on every nav change. */}
        <Suspense fallback={null}>
          <ProgressProvider>
            <ConfirmDialogProvider>
              <AdminLayoutInner>{children}</AdminLayoutInner>
              <Toaster />
            </ConfirmDialogProvider>
          </ProgressProvider>
        </Suspense>
      </QueryProvider>
    </AuthProvider>
  )
}
