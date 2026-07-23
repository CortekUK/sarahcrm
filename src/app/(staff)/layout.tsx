'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { AuthProvider, useAuth } from '@/providers/AuthProvider'
import { QueryProvider } from '@/providers/QueryProvider'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Toaster } from '@/components/ui-shadcn/toaster'
import { ShieldCheck, LogOut } from 'lucide-react'

// Staff self-service shell (/team). Deliberately minimal — a single top bar
// and the content beneath. Staff (team_member / freelancer) only ever see
// their own accountability tasks here; the middleware keeps them out of every
// other workspace.

function StaffLayoutInner({ children }: { children: React.ReactNode }) {
  const { signOut, profile } = useAuth()
  const router = useRouter()

  async function handleSignOut() {
    await signOut()
    router.replace('/admin/login')
  }

  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-surface">
        <div className="max-w-4xl mx-auto px-5 h-16 flex items-center justify-between">
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
      <main className="max-w-4xl mx-auto px-5 py-8">{children}</main>
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
