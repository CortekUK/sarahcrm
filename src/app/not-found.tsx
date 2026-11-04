import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowUpRight } from 'lucide-react'

// Branded 404 for any unknown URL (Next's default otherwise titles the
// page "404: This page could not be found.").
export const metadata: Metadata = {
  title: 'Page not found | The Club by Sarah Restrick',
  description: 'The page you were looking for could not be found.',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <section className="always-night relative min-h-screen bg-ink text-ivory flex items-center justify-center px-6 py-24">
      <div className="max-w-xl w-full text-center border border-bronze/40 bg-graphite/60 p-12 lg:p-16">
        <Image
          src="/logo-gold.png"
          alt="The Club"
          width={64}
          height={64}
          className="w-14 h-14 mx-auto mb-8 object-contain"
        />
        <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.4em] text-bronze-light mb-5">
          Error 404
        </p>
        <h1 className="font-[family-name:var(--font-display)] text-[clamp(2rem,3.4vw,2.8rem)] leading-[1.1] text-ivory mb-6">
          This page could not be found.
        </h1>
        <p className="font-[family-name:var(--font-editorial)] italic text-[16px] text-ivory-soft leading-[1.7]">
          The link may be out of date, or the page may have moved. Everything else is just where
          you left it.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 min-h-[44px] font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
          >
            Return to the homepage
            <ArrowUpRight size={13} strokeWidth={1.5} />
          </Link>
          <Link
            href="/events"
            className="inline-flex items-center gap-2 min-h-[44px] font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
          >
            Upcoming events
            <ArrowUpRight size={13} strokeWidth={1.5} />
          </Link>
        </div>
      </div>
    </section>
  )
}
