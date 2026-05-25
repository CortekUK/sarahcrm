import Link from 'next/link'
import { Check, ArrowUpRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

// Post-Stripe landing for guest event bookings. The actual booking
// status is flipped to 'confirmed' by the stripe-webhook function
// using the booking_id we stored in payment_intent metadata. This
// page just lands the user somewhere on-brand.

export default async function EventBookingSuccessPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return (
    <section className="relative min-h-[80vh] bg-ink flex items-center justify-center px-6 py-24">
      <div className="max-w-xl w-full text-center border border-bronze/40 bg-graphite/60 backdrop-blur-sm p-12 lg:p-16">
        <div className="w-16 h-16 mx-auto rounded-full bg-bronze/15 border border-bronze/40 flex items-center justify-center mb-7">
          <Check size={28} strokeWidth={1.5} className="text-bronze-light" />
        </div>
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
          Booking confirmed
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] text-ivory mb-6">
          A seat is yours.
        </h1>
        <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-[1.7]">
          Your payment is secured and the booking is with the team. A confirmation note will land in
          your inbox within the next few minutes.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
          <Link
            href={`/events/${slug}`}
            className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
          >
            Back to the evening
            <ArrowUpRight size={13} strokeWidth={1.5} />
          </Link>
          <Link
            href="/events"
            className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
          >
            Other evenings
            <ArrowUpRight size={13} strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </section>
  )
}
