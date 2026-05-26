'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Eye, EyeOff, Shield, KeyRound } from 'lucide-react'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

type LoginFormData = z.infer<typeof loginSchema>

// One shared shell, two role-specific surfaces.
//   role="member" → /login           — warm bronze frame, member dev login
//   role="admin"  → /admin/login     — graphite frame with gold shield, admin dev login
// The role is the *expected* role for the URL. If a user signs in with the
// wrong role for the page (e.g. an admin account on /login, or a member
// account on /admin/login), we sign them straight back out and show an error.
// That stops the cross-workspace privilege confusion the user flagged.

type Role = 'member' | 'admin'

interface LoginPageProps {
  role: Role
}

const COPY: Record<Role, {
  eyebrow: string
  heading: string
  subheading: string
  dev: { label: string; email: string; password: string }
  altLink: { href: string; label: string }
  footnote: React.ReactNode
}> = {
  member: {
    eyebrow: 'Member portal',
    heading: 'Welcome back',
    subheading: 'Sign in to your members area',
    dev: {
      label: 'Member dev login',
      email: 'devmember@sarahrestrick.com',
      password: 'DevTest2026!',
    },
    altLink: { href: '/admin/login', label: 'Administrator sign in →' },
    footnote: (
      <>
        Membership is by invitation only.
        <br />
        Contact us to learn about joining The Club.
      </>
    ),
  },
  admin: {
    eyebrow: 'Administrator',
    heading: 'Staff sign in',
    subheading: 'Access the management dashboard',
    dev: {
      label: 'Admin dev login',
      email: 'dev@sarahrestrick.com',
      password: 'DevTest2026!',
    },
    altLink: { href: '/login', label: 'Member sign in →' },
    footnote: (
      <>
        Restricted area — staff only.
        <br />
        Activity on this account is logged.
      </>
    ),
  },
}

export function LoginPage({ role }: LoginPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const copy = COPY[role]

  // `?redirect=/portal/events/<id>` is set by middleware when an
  // unauthenticated user tries to hit a /portal or /dashboard page.
  // After successful login we send them where they meant to go.
  // Guard against open-redirect attacks by only honouring same-origin paths
  // *and* paths that belong to this role's workspace.
  const requestedRedirect = searchParams.get('redirect') ?? ''
  const expectedPrefix = role === 'admin' ? '/dashboard' : '/portal'
  const safeRedirect =
    requestedRedirect.startsWith(expectedPrefix) && !requestedRedirect.startsWith('//')
      ? requestedRedirect
      : null

  // Membership-status messages set by the middleware when it boots a
  // user from /portal because their membership has been cancelled,
  // expired, or never existed. Member-login surface only.
  const reason = role === 'member' ? searchParams.get('reason') : null
  const reasonMessage =
    reason === 'membership_cancelled'
      ? 'Your membership has been cancelled. You can no longer sign in to the members portal — please get in touch if you believe this is a mistake.'
      : reason === 'membership_expired'
        ? 'Your membership has expired. Renew it from your account or contact the team to reactivate.'
        : reason === 'no_membership'
          ? 'This account no longer has an active membership. Please contact the team if you think this is a mistake.'
          : null

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  function quickLogin() {
    onSubmit({ email: copy.dev.email, password: copy.dev.password })
  }

  async function onSubmit(data: LoginFormData) {
    setError(null)
    setLoading(true)

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (authError) {
        setError(authError.message)
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('Unable to retrieve user session')
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      const actualRole: Role = profile?.role === 'admin' ? 'admin' : 'member'

      // Role mismatch: e.g. a member tried to sign into /admin/login, or an
      // admin tried /login. Sign them straight back out and tell them which
      // door to use — never silently grant them access. This is the second
      // half of the role gate; the middleware enforces the same rule on
      // every protected request after this.
      if (actualRole !== role) {
        await supabase.auth.signOut()
        setLoading(false)
        setError(
          role === 'admin'
            ? 'This account does not have administrator access. Use the member portal sign-in instead.'
            : 'Administrator accounts cannot sign in to the member portal. Use the staff sign-in instead.',
        )
        return
      }

      // Send them where they meant to go (if it's a same-workspace deep link)
      // or to the role's home.
      const fallback = role === 'admin' ? '/dashboard' : '/portal'
      router.replace(safeRedirect ?? fallback)
    } catch {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  const isAdmin = role === 'admin'

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand header — role-aware accent. Member: bronze hairlines around
            the tagline. Admin: a small shield mark above the wordmark so
            staff can tell at a glance which door they're at. */}
        <div className="text-center mb-10">
          <Image
            src="/logo-gold.png"
            alt=""
            width={72}
            height={72}
            priority
            className="w-16 h-16 mx-auto mb-5 object-contain"
          />
          {isAdmin && (
            <div className="flex items-center justify-center gap-2 mb-3">
              <Shield size={12} strokeWidth={1.8} className="text-gold" />
              <span className="font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.28em] text-gold">
                {copy.eyebrow}
              </span>
              <Shield size={12} strokeWidth={1.8} className="text-gold" />
            </div>
          )}
          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-semibold text-text mb-2">
            The Club
          </h1>
          <div className="flex items-center justify-center gap-4">
            <span className="block w-10 h-px bg-gold" />
            <p className="font-[family-name:var(--font-label)] text-xs font-medium uppercase tracking-[0.2em] text-text-muted">
              {isAdmin ? 'Management dashboard' : 'by Sarah Restrick'}
            </p>
            <span className="block w-10 h-px bg-gold" />
          </div>
        </div>

        {/* Dev quick-login — moved to the TOP of the column per request, so
            it's the first thing visible on dev builds instead of being
            buried under the form. Hidden in production unless the dev
            credentials match real seeded accounts. */}
        {process.env.NODE_ENV !== 'production' && (
          <div className="mb-6 px-4 py-3 rounded-[var(--radius-md)] border border-dashed border-border bg-surface/40">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.625rem] uppercase tracking-[0.2em] text-text-dim font-medium">
                  {copy.dev.label}
                </p>
                <p className="text-[11px] text-text-muted truncate mt-0.5">
                  {copy.dev.email}
                </p>
              </div>
              <button
                type="button"
                onClick={quickLogin}
                disabled={loading}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] rounded-[var(--radius-md)] border border-gold/50 text-gold hover:border-gold hover:bg-gold/10 transition-colors disabled:opacity-50"
              >
                <KeyRound size={12} strokeWidth={1.8} />
                Sign in
              </button>
            </div>
          </div>
        )}

        {/* Login card */}
        <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-8">
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text mb-1 text-center">
            {copy.heading}
          </h2>
          <p className="text-sm text-text-muted text-center mb-6">
            {copy.subheading}
          </p>

          {reasonMessage && !error && (
            <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-gold-muted border border-border-gold">
              <p className="text-sm text-text leading-relaxed">{reasonMessage}</p>
            </div>
          )}

          {error && (
            <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
              <p className="text-sm text-accent-warm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="Email Address"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              autoComplete="current-password"
              error={errors.password?.message}
              suffix={
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-text-dim hover:text-text transition-colors"
                >
                  {showPassword ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
                </button>
              }
              {...register('password')}
            />

            <Button
              type="submit"
              loading={loading}
              className="w-full font-[family-name:var(--font-body)] font-medium"
              size="lg"
            >
              Sign In
            </Button>
          </form>

          <div className="mt-6 pt-5 border-t border-border text-center">
            <p className="text-xs text-text-dim">{copy.footnote}</p>
          </div>
        </div>

        {/* Alt-role link — discreet, sits below the card. Lets staff jump to
            the admin door from the member page (and vice versa) without
            having to know the URL. */}
        <div className="mt-5 text-center">
          <Link
            href={copy.altLink.href}
            className="text-[11px] font-medium uppercase tracking-[0.22em] text-text-dim hover:text-gold transition-colors"
          >
            {copy.altLink.label}
          </Link>
        </div>

        <p className="text-center text-xs text-text-dim mt-6">
          The Club by Sarah Restrick &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
