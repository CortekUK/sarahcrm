import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import { cn } from '../lib/utils'
import { Avatar } from '../components/ui/Avatar'
import {
  LayoutDashboard,
  CalendarDays,
  User,
  Handshake,
  Users,
  LogOut,
} from 'lucide-react'

const navItems = [
  { to: '/portal', label: 'My Dashboard', icon: LayoutDashboard, end: true },
  { to: '/portal/events', label: 'Events', icon: CalendarDays, end: false },
  { to: '/portal/introductions', label: 'Introductions', icon: Handshake, end: false },
  { to: '/portal/network', label: 'Network', icon: Users, end: false },
  { to: '/portal/profile', label: 'My Profile', icon: User, end: false },
]

export function MemberLayout() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()
  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-surface border-b border-border">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-16">
            {/* Brand */}
            <NavLink to="/portal" className="flex items-center gap-3">
              <div>
                <span className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
                  The Club
                </span>
                <span className="font-[family-name:var(--font-label)] text-[0.5rem] font-medium uppercase tracking-[0.2em] text-text-dim ml-2">
                  by Sarah Restrick
                </span>
              </div>
            </NavLink>

            {/* Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 px-3.5 py-2 rounded-full text-sm transition-colors',
                      isActive
                        ? 'text-gold bg-gold-muted font-medium'
                        : 'text-text-muted hover:text-text hover:bg-surface-2'
                    )
                  }
                >
                  <item.icon size={16} strokeWidth={1.5} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Profile / sign out */}
            <div className="flex items-center gap-3">
              <NavLink
                to="/portal/profile"
                className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
              >
                <Avatar name={name || profile?.email || '?'} src={profile?.avatar_url} size="sm" />
                <span className="text-sm font-medium text-text hidden lg:block">
                  {name || 'Member'}
                </span>
              </NavLink>
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
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-full text-xs whitespace-nowrap transition-colors',
                    isActive
                      ? 'text-gold bg-gold-muted font-medium'
                      : 'text-text-muted'
                  )
                }
              >
                <item.icon size={14} strokeWidth={1.5} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <Outlet />
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
