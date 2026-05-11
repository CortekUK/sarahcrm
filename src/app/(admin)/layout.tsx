'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/dashboard/members', label: 'Members', icon: Users },
  { to: '/dashboard/events', label: 'Events', icon: CalendarDays },
  { to: '/dashboard/introductions', label: 'Introductions', icon: Handshake },
  { to: '/dashboard/communications', label: 'Communications', icon: Mail },
  { to: '/dashboard/finance', label: 'Finance', icon: PoundSterling },
]

const websiteSubItems = [
  { to: '/dashboard/website/galleries', label: 'Galleries' },
  { to: '/dashboard/website/hero-slides', label: 'Hero Slides' },
  { to: '/dashboard/website/testimonials', label: 'Testimonials' },
  { to: '/dashboard/website/partners', label: 'Partners' },
  { to: '/dashboard/website/experiences', label: 'Experiences' },
  { to: '/dashboard/website/videos', label: 'Videos' },
  { to: '/dashboard/website/documents', label: 'Documents' },
]

function WebsiteNavGroup({ pathname }: { pathname: string }) {
  const isWebsiteActive = pathname.startsWith('/dashboard/website')
  const [expanded, setExpanded] = useState(isWebsiteActive)

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm transition-colors relative w-full',
          isWebsiteActive
            ? 'text-gold font-medium bg-[rgba(184,151,90,0.06)]'
            : 'text-text-muted hover:text-text hover:bg-surface-3'
        )}
      >
        {isWebsiteActive && (
          <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gold" />
        )}
        <Globe size={18} strokeWidth={1.5} />
        <span className="flex-1 text-left">Website</span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          className={cn('transition-transform', expanded && 'rotate-180')}
        />
      </button>
      {expanded && (
        <div className="ml-4 mt-0.5 space-y-0.5">
          {websiteSubItems.map((item) => {
            const active = pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                href={item.to}
                className={cn(
                  'block px-3 py-1.5 rounded-[var(--radius-md)] text-[0.8125rem] transition-colors',
                  active
                    ? 'text-gold font-medium'
                    : 'text-text-dim hover:text-text hover:bg-surface-3'
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      )}
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

  function isActive(to: string) {
    if (to === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(to)
  }

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-[220px] bg-surface-2 border-r border-border flex flex-col z-40">
        {/* Logo */}
        <div className="px-6 py-6 border-b border-border">
          <h1 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text leading-tight">
            The Club
          </h1>
          <p className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.2em] text-text-muted mt-0.5">
            by Sarah Restrick
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.to}
              href={item.to}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm transition-colors relative',
                isActive(item.to)
                  ? 'text-gold font-medium bg-[rgba(184,151,90,0.06)]'
                  : 'text-text-muted hover:text-text hover:bg-surface-3'
              )}
            >
              {/* Gold left border indicator */}
              {isActive(item.to) && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gold" />
              )}
              <item.icon size={18} strokeWidth={1.5} />
              <span>{item.label}</span>
            </Link>
          ))}

          {/* Website expandable group */}
          <WebsiteNavGroup pathname={pathname} />
        </nav>

        {/* Bottom section */}
        <div className="px-3 py-4 border-t border-border space-y-0.5">
          {profile && (
            <div className="px-3 py-2 mb-2">
              <p className="text-sm font-medium text-text truncate">
                {profile.first_name} {profile.last_name}
              </p>
              <p className="text-xs text-text-dim truncate">{profile.email}</p>
            </div>
          )}
          <Link
            href="/dashboard/settings"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm transition-colors',
              isActive('/dashboard/settings')
                ? 'text-gold font-medium bg-[rgba(184,151,90,0.06)]'
                : 'text-text-muted hover:text-text hover:bg-surface-3'
            )}
          >
            <Settings size={18} strokeWidth={1.5} />
            <span>Settings</span>
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm text-text-muted hover:text-accent-warm hover:bg-surface-3 transition-colors w-full"
          >
            <LogOut size={18} strokeWidth={1.5} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-[220px] flex-1 min-h-screen">
        {children}
      </main>
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
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AuthProvider>
  )
}
