// Public unsubscribe landing. Hit by the footer link in every
// campaign email — token comes from mailing_list.unsubscribe_token
// (one per subscriber). Server component so we can update the DB
// inline; no client JS needed.
//
// Idempotent — landing on the page twice with the same token sets
// unsubscribed_at the first time and is a no-op the second time.

import Link from 'next/link'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Check, ArrowUpRight, AlertCircle } from 'lucide-react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ token?: string }>
}

function getAdminDb() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const { token } = await searchParams
  let state: 'ok' | 'already' | 'missing' | 'unknown' = 'missing'
  let email: string | null = null

  if (token) {
    const admin = getAdminDb()
    const { data: row } = await admin
      .from('mailing_list')
      .select('id, email, unsubscribed_at')
      .eq('unsubscribe_token', token)
      .maybeSingle()
    if (!row) {
      state = 'unknown'
    } else if (row.unsubscribed_at) {
      state = 'already'
      email = row.email
    } else {
      await admin
        .from('mailing_list')
        .update({ unsubscribed_at: new Date().toISOString() })
        .eq('id', row.id)
      state = 'ok'
      email = row.email
    }
  }

  return (
    <section className="relative min-h-[80vh] bg-ink flex items-center justify-center px-6 py-24">
      <div className="max-w-xl w-full text-center border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-12 lg:p-16">
        {state === 'ok' || state === 'already' ? (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-7">
              <Check size={28} strokeWidth={1.5} className="text-bronze-light" />
            </div>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
              {state === 'already' ? 'Already removed' : 'Unsubscribed'}
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] text-ivory mb-6">
              {state === 'already'
                ? "You're already off the list."
                : 'You will no longer receive our notes.'}
            </h1>
            <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-[1.7]">
              {email
                ? `We've removed ${email} from our newsletter. If this was a mistake, you're welcome back any time.`
                : 'If this was a mistake, you can resubscribe from the homepage.'}
            </p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-plum/40 border border-plum-light/40 flex items-center justify-center mb-7">
              <AlertCircle size={28} strokeWidth={1.5} className="text-bronze-light" />
            </div>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
              {state === 'missing' ? 'No token' : 'Token not recognised'}
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
