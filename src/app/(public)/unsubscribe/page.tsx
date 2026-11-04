// Public unsubscribe landing. Hit by the footer link in every
// campaign email. Two link types:
//   ?token=<uuid>          — newsletter subscriber (mailing_list.unsubscribe_token)
//   ?e=<b64 email>&sig=<…> — member link (HMAC-signed email)
//
// GET never changes anything: mail security scanners pre-open every link
// in an email, so opening this page only *reads* who the link belongs to.
// The visitor must press "Confirm unsubscribe", which POSTs to
// /api/newsletter/unsubscribe.

import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Check, ArrowUpRight, AlertCircle } from 'lucide-react'
import { verifyMemberUnsubscribe } from '@/lib/email/unsubscribe'
import { ConfirmUnsubscribe } from './ConfirmUnsubscribe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Unsubscribe | The Club',
  description: 'Manage your email preferences for The Club by Sarah Restrick.',
  robots: { index: false, follow: false },
}

interface PageProps {
  searchParams: Promise<{ token?: string; e?: string; sig?: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// Masks the local part so a forwarded link doesn't fully expose the address.
function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'•'.repeat(Math.max(1, local.length - visible.length))}@${domain}`
}

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const { token, e, sig } = await searchParams
  let state: 'confirm' | 'already' | 'invalid' = 'invalid'
  let email: string | null = null
  let body: { token: string } | { e: string; sig: string } | null = null

  if (token) {
    if (UUID_RE.test(token)) {
      // Read-only lookup — no writes on GET.
      const { data: row } = await getAdminDb()
        .from('mailing_list')
        .select('email, unsubscribed_at')
        .eq('unsubscribe_token', token)
        .maybeSingle()
      if (row) {
        email = row.email
        state = row.unsubscribed_at ? 'already' : 'confirm'
        body = { token }
      }
    }
  } else if (e && sig) {
    const verified = verifyMemberUnsubscribe(e, sig)
    if (verified) {
      email = verified
      state = 'confirm'
      body = { e, sig }
    }
  }

  return (
    <section className="relative min-h-[80vh] bg-ink flex items-center justify-center px-6 py-24">
      <div className="max-w-xl w-full text-center border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-12 lg:p-16">
        {state === 'confirm' && body ? (
          <ConfirmUnsubscribe body={body} displayEmail={email ? maskEmail(email) : null} />
        ) : state === 'already' ? (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-7">
              <Check size={28} strokeWidth={1.5} className="text-bronze-light" />
            </div>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
              Already removed
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] text-ivory mb-6">
              You&apos;re already off the list.
            </h1>
            <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-[1.7]">
              {email
                ? `${maskEmail(email)} no longer receives our newsletter. If this was a mistake, you're welcome back any time.`
                : 'If this was a mistake, you can resubscribe from the homepage.'}
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-plum/40 border border-plum-light/40 flex items-center justify-center mb-7">
              <AlertCircle size={28} strokeWidth={1.5} className="text-bronze-light" />
            </div>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
              {token || e || sig ? 'Link not recognised' : 'No link'}
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] text-ivory mb-6">
              We couldn&apos;t find that link.
            </h1>
            <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-[1.7]">
              The link may have expired or been edited. If you keep receiving email and want to
              stop, reply directly to any newsletter we sent you and we&apos;ll remove you by hand.
            </p>
          </>
        )}

        <Link
          href="/"
          className="mt-10 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
        >
          Return to the homepage
          <ArrowUpRight size={13} strokeWidth={1.5} />
        </Link>
      </div>
    </section>
  )
}
