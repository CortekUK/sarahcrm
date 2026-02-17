import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../providers/AuthProvider'
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Handshake,
  Mail,
  PoundSterling,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '../lib/utils'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/dashboard/members', label: 'Members', icon: Users },
  { to: '/dashboard/events', label: 'Events', icon: CalendarDays },
  { to: '/dashboard/introductions', label: 'Introductions', icon: Handshake },
  { to: '/dashboard/communications', label: 'Communications', icon: Mail },
  { to: '/dashboard/finance', label: 'Finance', icon: PoundSterling },
]

export function AdminLayout() {
  const { signOut, profile } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
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
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm transition-colors relative',
                  isActive
                    ? 'text-gold font-medium bg-[rgba(184,151,90,0.06)]'
                    : 'text-text-muted hover:text-text hover:bg-surface-3'
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Gold left border indicator */}
                  {isActive && (
                    <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gold" />
                  )}
                  <item.icon size={18} strokeWidth={1.5} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
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
          <NavLink
            to="/dashboard/settings"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-sm transition-colors',
                isActive
                  ? 'text-gold font-medium bg-[rgba(184,151,90,0.06)]'
                  : 'text-text-muted hover:text-text hover:bg-surface-3'
              )
            }
          >
            <Settings size={18} strokeWidth={1.5} />
            <span>Settings</span>
          </NavLink>
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
        <Outlet />
      </main>
    </div>
  )
}
