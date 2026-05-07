'use client'

import Link from 'next/link'
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
} from 'lucide-react'

const navItems = [
  { to: '/portal', label: 'My Dashboard', icon: LayoutDashboard, end: true },
  { to: '/portal/events', label: 'Events', icon: CalendarDays, end: false },
  { to: '/portal/introductions', label: 'Introductions', icon: Handshake, end: false },
  { to: '/portal/network', label: 'Network', icon: Users, end: false },
  { to: '/portal/billing', label: 'Billing', icon: CreditCard, end: false },
  { to: '/portal/profile', label: 'My Profile', icon: User, end: false },
]

function PortalLayoutInner({ children }: { children: React.ReactNode }) {
  const { signOut, profile } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()

  async function handleSignOut() {
    await signOut()
    router.replace('/login')
  }

  function isActive(to: string, end: boolean) {
    if (end) return pathname === to
    return pathname.startsWith(to)
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-surface border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Brand */}
            <Link href="/portal" className="flex items-center gap-3">
              <div>
                <span className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
                  The Club
                </span>
                <span className="font-[family-name:var(--font-label)] text-[0.5rem] font-medium uppercase tracking-[0.2em] text-text-dim ml-2">
                  by Sarah Restrick
                </span>
              </div>
            </Link>

            {/* Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  href={item.to}
                  className={cn(
                    'flex items-center gap-2 px-3.5 py-2 rounded-full text-sm transition-colors',
                    isActive(item.to, item.end)
                      ? 'text-gold bg-gold-muted font-medium'
                      : 'text-text-muted hover:text-text hover:bg-surface-2'
                  )}
                >
                  <item.icon size={16} strokeWidth={1.5} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </nav>

            {/* Profile / sign out */}
            <div className="flex items-center gap-3">
              <Link
                href="/portal/profile"
                className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
              >
                <Avatar name={name || profile?.email || '?'} src={profile?.avatar_url} size="sm" />
                <span className="text-sm font-medium text-text hidden lg:block">
                  {name || 'Member'}
                </span>
              </Link>
              <button
                onClick={handleSignOut}
                className="p-2 rounded-full text-text-dim hover:text-accent-warm hover:bg-surface-2 transition-colors"
                title="Sign out"
              >
                <LogOut size={16} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden border-t border-border overflow-x-auto">
          <div className="flex px-4 gap-1 py-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                href={item.to}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs whitespace-nowrap transition-colors',
                  isActive(item.to, item.end)
                    ? 'text-gold bg-gold-muted font-medium'
                    : 'text-text-muted'
                )}
              >
                <item.icon size={14} strokeWidth={1.5} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-xs text-text-dim">
            The Club by Sarah Restrick &copy; {new Date().getFullYear()}
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
