'use client'

import { useState, type ComponentType } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { QueryProvider } from '@/providers/QueryProvider'
import { Toaster } from '@/components/ui-shadcn/toaster'
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Handshake,
  Mail,
  PoundSterling,
  Globe,
  ChevronDown,
  Settings,
  LogOut,
  Sparkles,
  Send,
  Ticket,
  ClipboardList,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
    ],
  },
  {
    label: 'Engage',
    items: [
      {
        to: '/dashboard/communications',
        label: 'Communications',
        icon: Mail,
        children: [
          { to: '/dashboard/communications', label: 'Overview', icon: Send },
          { to: '/dashboard/communications/templates', label: 'AI Templates', icon: Sparkles },
        ],
      },
      { to: '/dashboard/finance', label: 'Finance', icon: PoundSterling },
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
          { to: '/dashboard/website/galleries', label: 'Galleries' },
          { to: '/dashboard/website/hero-slides', label: 'Hero Slides' },
          { to: '/dashboard/website/testimonials', label: 'Testimonials' },
          { to: '/dashboard/website/partners', label: 'Partners' },
          // Past-highlight showcase tiles for the Private Events page.
          // Real bookable private events are managed under Events with
          // event_type = curated_luxury, not here.
          { to: '/dashboard/website/experiences', label: 'Past Highlights' },
          { to: '/dashboard/website/videos', label: 'Videos' },
          { to: '/dashboard/website/documents', label: 'Documents' },
        ],
      },
    ],
  },
]

function isNavGroup(item: NavItem | NavGroup): item is NavGroup {
  return 'children' in item
}

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
        'group relative flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm transition-all',
        active
          ? 'text-[var(--color-gold-dark)] font-medium bg-white shadow-[var(--shadow-sm)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/60',
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--color-gold)]" />
      )}
      <Icon
        size={17}
        strokeWidth={1.6}
        className={cn(
          'transition-colors',
          active ? 'text-[var(--color-gold)]' : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]',
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
          'group relative flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm w-full transition-all',
          isActive
            ? 'text-[var(--color-gold-dark)] font-medium bg-white shadow-[var(--shadow-sm)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-white/60',
        )}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--color-gold)]" />
        )}
        <Icon
          size={17}
          strokeWidth={1.6}
          className={cn(
            'transition-colors',
            isActive ? 'text-[var(--color-gold)]' : 'text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]',
          )}
        />
        <span className="flex-1 text-left truncate">{group.label}</span>
        <ChevronDown
          size={13}
          strokeWidth={1.8}
          className={cn(
            'transition-transform text-[var(--color-text-dim)]',
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
                    'flex items-center gap-2 px-3 py-1.5 rounded-[var(--radius-md)] text-[13px] transition-colors',
                    childActive
                      ? 'text-[var(--color-gold-dark)] font-medium bg-[var(--color-gold)]/8'
                      : 'text-[var(--color-text-dim)] hover:text-[var(--color-text)] hover:bg-white/60',
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
  const router = useRouter()
  const pathname = usePathname()

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex">
      {/* Sidebar */}
      <aside
        className="fixed left-0 top-0 bottom-0 w-[244px] flex flex-col z-40 border-r border-[var(--color-border)]"
        style={{
          background:
            'linear-gradient(180deg, var(--color-surface-2) 0%, var(--color-bg-alt) 100%)',
        }}
      >
        {/* Brand header */}
        <div className="px-6 pt-7 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-[var(--radius-md)] bg-gradient-to-br from-[var(--color-gold)] to-[var(--color-gold-dark)] flex items-center justify-center shadow-[var(--shadow-sm)]">
              <span className="font-[family-name:var(--font-heading)] text-white text-base font-semibold leading-none">
                C
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="font-[family-name:var(--font-heading)] text-[15px] font-semibold text-[var(--color-text)] leading-tight">
                The Club
              </h1>
              <p className="font-[family-name:var(--font-label)] text-[9px] font-medium uppercase tracking-[0.22em] text-[var(--color-text-dim)] mt-0.5">
                by Sarah Restrick
              </p>
            </div>
          </div>
        </div>

        <div className="h-px bg-[var(--color-border)]/70 mx-5" />

        {/* Nav — grouped with section labels */}
        <nav className="flex-1 py-4 px-3 overflow-y-auto">
          {NAV_SECTIONS.map((section, idx) => (
            <div key={section.label} className={idx > 0 ? 'mt-5' : ''}>
              <p className="px-3 mb-1.5 text-[9px] font-medium uppercase tracking-[0.22em] text-[var(--color-text-dim)]">
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
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      label={item.label}
                      Icon={item.icon}
                      active={active}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer — profile, settings, signout */}
        <div className="border-t border-[var(--color-border)]/70 px-3 py-3 space-y-0.5">
          {profile && (
            <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-[var(--color-gold-muted)] flex items-center justify-center flex-shrink-0 overflow-hidden">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={profile.first_name ?? 'profile'}
                    width={32}
                    height={32}
                    className="object-cover"
                  />
                ) : (
                  <span className="font-[family-name:var(--font-heading)] text-[var(--color-gold-dark)] text-sm font-semibold">
                    {(profile.first_name?.[0] ?? '?').toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[var(--color-text)] truncate leading-tight">
                  {profile.first_name} {profile.last_name}
                </p>
                <p className="text-[11px] text-[var(--color-text-dim)] truncate">
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
          <button
            onClick={handleSignOut}
            className="group flex items-center gap-3 px-3 py-2 rounded-[var(--radius-md)] text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent-warm)] hover:bg-white/60 transition-all w-full"
          >
            <LogOut size={17} strokeWidth={1.6} />
            <span>Sign out</span>
          </button>
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
        <AdminLayoutInner>{children}</AdminLayoutInner>
        <Toaster />
      </QueryProvider>
    </AuthProvider>
  )
}
