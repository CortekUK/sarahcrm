'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { QueryProvider } from '@/providers/QueryProvider'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Toaster } from '@/components/ui-shadcn/toaster'
import { ShieldCheck, LogOut, Inbox, ListTodo } from 'lucide-react'
import { cn } from '@/lib/utils'

// Staff self-service shell (/team). Deliberately minimal — a single top bar
// and the content beneath. Staff (team_member / freelancer) only ever see
// their own accountability tasks here; the middleware keeps them out of every
// other workspace. The Inbox link appears only when an admin has granted the
// staff member at least one club inbox (Inbox → Access).

// Does the signed-in staff member have any inbox granted? The inbox API
// answers 403 when they don't.
function useHasInbox(): boolean {
  const [has, setHas] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/inbox/mailboxes')
      .then(async (res) => {
        if (!res.ok) return false
        const data = (await res.json()) as { mailboxes?: unknown[] }
        return (data.mailboxes?.length ?? 0) > 0
      })
      .catch(() => false)
      .then((v) => {
        if (!cancelled) setHas(v)
      })
    return () => {
      cancelled = true
    }
  }, [])
  return has
}

function StaffNavLink({
  href,
  active,
  icon: Icon,
  children,
}: {
  href: string
  active: boolean
  icon: typeof Inbox
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-sm transition-colors',
        active
          ? 'bg-gold-muted font-medium text-gold'
          : 'text-text-muted hover:bg-surface-2 hover:text-text',
      )}
    >
      <Icon size={15} strokeWidth={1.7} />
      {children}
    </Link>
  )
}

function StaffLayoutInner({ children }: { children: React.ReactNode }) {
  const { signOut, profile } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const hasInbox = useHasInbox()
  const onInbox = pathname.startsWith('/team/inbox')

  async function handleSignOut() {
    await signOut()
    router.replace('/admin/login')
  }

  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div
          className={cn(
            'mx-auto px-5 h-16 flex items-center justify-between gap-3',
            onInbox ? 'max-w-none' : 'max-w-4xl',
          )}
        >
          <div className="flex items-center gap-3">
            <Image
              src="/logo-gold.png"
              alt=""
              width={32}
              height={32}
              priority
              className="w-8 h-8 object-contain"
            />
            <div className="min-w-0">
              <p className="font-[family-name:var(--font-heading)] text-sm font-semibold text-text leading-tight">
                The Club
              </p>
              <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.18em] text-gold">
                <ShieldCheck size={11} /> My tasks
              </p>
            </div>
          </div>
          {(hasInbox || onInbox) && (
            <nav className="flex items-center gap-1" aria-label="Staff portal">
              <StaffNavLink href="/team" active={!onInbox} icon={ListTodo}>
                <span className="hidden sm:inline">My tasks</span>
              </StaffNavLink>
              <StaffNavLink href="/team/inbox" active={onInbox} icon={Inbox}>
                <span className="hidden sm:inline">Inbox</span>
              </StaffNavLink>
            </nav>
          )}
          <div className="flex items-center gap-3">
            {name && <span className="hidden sm:inline text-sm text-text-muted">{name}</span>}
            <ThemeToggle variant="icon" />
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-accent-warm transition-colors"
            >
              <LogOut size={16} strokeWidth={1.7} />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>
      {onInbox ? (
        // The inbox is a full-width two-pane screen sized to the viewport.
        <main>{children}</main>
      ) : (
        <main className="max-w-4xl mx-auto px-5 py-8">{children}</main>
      )}
    </div>
  )
}

export default function StaffGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <QueryProvider>
        <StaffLayoutInner>{children}</StaffLayoutInner>
        <Toaster />
      </QueryProvider>
    </AuthProvider>
  )
}
