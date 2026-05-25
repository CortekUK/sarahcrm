'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Eye, EyeOff, ShieldCheck, CheckCircle2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────
// /set-password — landing page for the Supabase invitation email.
//
// Critical bug this defends against:
//   If an admin (or anyone else) is already signed in in this browser
//   when the invitee clicks the email link, the invite hash arrives at
//   /set-password while the OLD session is still active in cookies +
//   localStorage. Without intervention, the password-update form fires
//   against whichever session wins the race — which has historically
//   meant the admin's password gets overwritten with the invitee's
//   chosen password, and the invitee never gets a working account.
//
// Hard guarantee: this page ALWAYS signs out any existing session
// before processing the invite hash, then explicitly establishes the
// invitee's session from the hash tokens. From that point on
// updateUser() is unambiguously operating on the invited user.
// ─────────────────────────────────────────────────────────────────────

const schema = z
  .object({
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Za-z]/, 'Include at least one letter')
      .regex(/[0-9]/, 'Include at least one number'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords don’t match',
    path: ['confirm'],
  })

type FormData = z.infer<typeof schema>

type AuthState = 'checking' | 'ready' | 'no-session' | 'done'

// Parse `#access_token=…&refresh_token=…&type=…` out of the URL hash.
// Returns null if the expected tokens aren't there.
function parseHashTokens(): {
  access_token: string
  refresh_token: string
  type: string | null
} | null {
  if (typeof window === 'undefined') return null
  const hash = window.location.hash.replace(/^#/, '')
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) return null
  return { access_token, refresh_token, type: params.get('type') }
}

export function SetPasswordPage() {
  const router = useRouter()
  const [authState, setAuthState] = useState<AuthState>('checking')
  const [error, setError] = useState<string | null>(null)
  const [showPwd, setShowPwd] = useState(false)
  const [memberName, setMemberName] = useState<string | null>(null)
  // The email pulled out of the invitee's JWT — surfaced in the form so
  // the user can visually confirm WHO they're setting a password for
  // (so a "wait that's not me" mistake is caught before submit).
  const [inviteEmail, setInviteEmail] = useState<string | null>(null)
  const initRanRef = useRef(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    // Hard-guard against React Strict Mode running this twice in dev,
    // which would sign out twice + try to setSession with already-
    // consumed tokens the second time.
    if (initRanRef.current) return
    initRanRef.current = true

    let mounted = true

    async function init() {
      const tokens = parseHashTokens()

      // No tokens in URL → either bookmarked /set-password, or already
      // processed (Supabase strips the hash after consuming it). Check
      // session in case we landed here via the auto-redirect after a
      // successful setSession.
      if (!tokens) {
        const { data } = await supabase.auth.getSession()
        if (!mounted) return
        if (data.session) {
          handleSessionReady(data.session.user)
        } else {
          setAuthState('no-session')
        }
        return
      }

      // Tokens present → enforce the "fresh session" rule.
      // 1. Sign out whatever's currently in cookies/localStorage. This
      //    is the line that prevents the admin's password from getting
      //    overwritten.
      try {
        await supabase.auth.signOut({ scope: 'local' })
      } catch {
        // Non-fatal — proceeding will just overwrite the session below.
      }

      // 2. Strip the hash from the URL so reloading the page doesn't
      //    re-process the (now-consumed) tokens.
      try {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search,
        )
      } catch {
        /* ignore */
      }

      // 3. Establish the invitee's session explicitly with the tokens
      //    we plucked from the hash. If this fails (expired token, etc)
      //    show the no-session state.
      const { data, error: setErr } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      })
      if (!mounted) return
      if (setErr || !data.session) {
        console.warn('[set-password] setSession failed', setErr)
        setAuthState('no-session')
        return
      }
      handleSessionReady(data.session.user)
    }

    function handleSessionReady(user: { email?: string | null; user_metadata?: unknown }) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>
      const first = typeof meta.first_name === 'string' ? meta.first_name : null
      setMemberName(first)
      setInviteEmail(user.email ?? null)
      setAuthState('ready')
    }

    init()

    return () => {
      mounted = false
    }
  }, [])

  async function onSubmit(data: FormData) {
    setError(null)
    // Belt-and-braces: re-confirm which user we're operating on right
    // before we change their password. If the session somehow shifted
    // between mount and submit, bail rather than risk updating the
    // wrong account.
    const { data: cur } = await supabase.auth.getUser()
    if (!cur.user || (inviteEmail && cur.user.email !== inviteEmail)) {
      setError(
        'Session mismatch — please open the invitation link again in a private window.',
      )
      return
    }
    const { error: err } = await supabase.auth.updateUser({ password: data.password })
    if (err) {
      setError(err.message)
      return
    }
    setAuthState('done')
    // Brief celebration screen before the router push.
    setTimeout(() => router.replace('/portal'), 1500)
  }

  // No invite token in URL — bookmark / expired link case
  if (authState === 'no-session') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <BrandHeader />
          <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-8 mt-10">
            <p className="text-sm text-text-muted mb-5">
              This password-set link is no longer active. Invitation links expire after a short
              window — open the most recent invitation email, or sign in with an existing password.
            </p>
            <Button onClick={() => router.replace('/login')} className="w-full" size="lg">
              Go to sign in
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (authState === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-sm text-text-muted">Confirming your invitation…</div>
      </div>
    )
  }

  if (authState === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <BrandHeader />
          <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-10 mt-10">
            <div className="w-14 h-14 mx-auto rounded-full bg-bronze/15 ring-1 ring-bronze/30 flex items-center justify-center mb-5">
              <CheckCircle2 size={26} strokeWidth={1.5} className="text-bronze-light" />
            </div>
            <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text mb-2">
              Welcome to The Club.
            </h2>
            <p className="text-sm text-text-muted">
              Your password is set. Taking you to your members area…
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Ready — show the password form
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <BrandHeader />
        <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-8 mt-10">
          <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-bronze/15 ring-1 ring-bronze/30 mb-5">
            <ShieldCheck size={22} strokeWidth={1.5} className="text-bronze-light" />
          </div>
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text mb-1 text-center">
            {memberName ? `Welcome, ${memberName}` : 'Set your password'}
          </h2>
          <p className="text-sm text-text-muted text-center mb-1">
            Choose a password to finish setting up your members account.
          </p>
          {/* Surface the invitee's email so they can visually confirm
             they're setting the password for the right account — and
             not, say, an admin session that lingered in the browser. */}
          {inviteEmail && (
            <p className="text-xs text-text-dim text-center mb-6 mt-2">
              Setting password for{' '}
              <span className="font-medium text-text">{inviteEmail}</span>
            </p>
          )}

          {error && (
            <div className="mb-5 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.08)] border border-[rgba(196,105,74,0.2)]">
              <p className="text-sm text-accent-warm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="New password"
              type={showPwd ? 'text' : 'password'}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              error={errors.password?.message}
              suffix={
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPwd((v) => !v)}
                  className="text-text-dim hover:text-text transition-colors"
                >
                  {showPwd ? (
                    <EyeOff size={18} strokeWidth={1.5} />
                  ) : (
                    <Eye size={18} strokeWidth={1.5} />
                  )}
                </button>
              }
              {...register('password')}
            />

            <Input
              label="Confirm password"
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              error={errors.confirm?.message}
              {...register('confirm')}
            />

            <Button
              type="submit"
              loading={isSubmitting}
              className="w-full font-[family-name:var(--font-body)] font-medium"
              size="lg"
            >
              Set password &amp; enter
            </Button>
          </form>

          <p className="mt-6 pt-5 border-t border-border text-center text-[11px] text-text-dim leading-relaxed">
            By setting a password you confirm you&apos;re the named applicant. The Club&apos;s
            membership terms apply.
          </p>
        </div>
      </div>
    </div>
  )
}

// Brand header — diamond C monogram + wordmark, same vocabulary as the
// login page so the two surfaces feel like one set.
function BrandHeader() {
  return (
    <div className="text-center">
      <Image
        src="/logo-gold.png"
        alt=""
        width={72}
        height={72}
        priority
        className="w-14 h-14 mx-auto mb-4 object-contain"
      />
      <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text mb-2">
        The Club
      </h1>
      <div className="flex items-center justify-center gap-4">
        <span className="block w-10 h-px bg-gold" />
        <p className="font-[family-name:var(--font-label)] text-xs font-medium uppercase tracking-[0.2em] text-text-muted">
          by Sarah Restrick
        </p>
        <span className="block w-10 h-px bg-gold" />
      </div>
    </div>
  )
}
