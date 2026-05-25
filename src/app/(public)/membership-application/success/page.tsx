import Link from 'next/link'
import { Check, ArrowUpRight } from 'lucide-react'

// Post-Stripe success page. We don't fetch the session here — the
// stripe-webhook function is what marks the application as 'paid'.
// This page just exists to land the user somewhere on-brand after
// they finish payment.

export const dynamic = 'force-dynamic'

export default function MembershipApplicationSuccessPage() {
  return (
    <section className="relative min-h-[80vh] bg-ink flex items-center justify-center px-6 py-24">
      <div className="max-w-xl w-full text-center border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-12 lg:p-16">
        <div className="w-16 h-16 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-7">
          <Check size={28} strokeWidth={1.5} className="text-bronze-light" />
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
          Payment received
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] text-ivory mb-6">
          Welcome to The Club.
        </h1>
        <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-[1.7]">
          Your payment is secured and your application is with the team. You&apos;ll receive a
          personal note from us within seven days confirming your membership.
        </p>
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
