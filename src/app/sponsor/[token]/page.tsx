import { notFound } from 'next/navigation'
import { Calendar, MapPin, ImageIcon, Megaphone, Users, ClipboardList, BarChart3 } from 'lucide-react'
import { loadSponsorPortal, type SponsorDeliverable } from '@/lib/sponsors/portal'
import { DeliverableSubmit } from './DeliverableSubmit'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────
// /sponsor/[token] — the public, login-free Sponsor Portal.
//
// Resolved server-side by the per-sponsor booking_token via the
// service-role client (see lib/sponsors/portal.ts) — RLS is never opened
// to the public. Read-only, on-brand (night editorial palette). Shows the
// sponsor their event, assets required + branding deadlines, guest
// allocation, and the ROI report once it has been generated.
// ─────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return 'Date to be confirmed'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function DeliverableList({ items, token }: { items: SponsorDeliverable[]; token: string }) {
  if (items.length === 0) {
    return <p className="text-[13.5px] italic text-ivory-soft/70">Nothing required here at the moment.</p>
  }
  return (
    <ul className="divide-y divide-graphite-line/40">
      {items.map((d) => (
        <DeliverableSubmit key={d.id} token={token} deliverable={d} />
      ))}
    </ul>
  )
}

function Section({
  icon,
  eyebrow,
  title,
  children,
}: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border border-graphite-line/45 bg-graphite/30 p-7 lg:p-9">
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-bronze/30 bg-bronze/10 text-bronze-light">
          {icon}
        </span>
        <div>
          <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light/85">
            {eyebrow}
          </p>
          <h2 className="font-[family-name:var(--font-display)] text-[19px] leading-tight text-ivory">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  )
}

export default async function SponsorPortalPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await loadSponsorPortal(token)
  if (!data) notFound()

  const assets = data.deliverables.filter((d) => d.category === 'asset')
  const branding = data.deliverables.filter((d) => d.category === 'branding')
  const guests = data.deliverables.filter((d) => d.category === 'guest_allocation')
  const other = data.deliverables.filter(
    (d) => !d.category || !['asset', 'branding', 'guest_allocation'].includes(d.category),
  )

  return (
    <main className="min-h-screen bg-ink text-ivory antialiased">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 lg:py-24">
        {/* ── Masthead ─────────────────────────────────────────────── */}
        <header className="mb-12 text-center">
          <p className="font-[family-name:var(--font-display)] text-[26px] tracking-[0.02em] text-ivory">
            The Club
          </p>
          <div className="mt-2.5 flex items-center justify-center gap-3">
            <span className="h-px w-7 bg-bronze/70" />
            <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.24em] text-bronze-light">
              by Sarah Restrick
            </span>
            <span className="h-px w-7 bg-bronze/70" />
          </div>
        </header>

        {/* ── Header block ─────────────────────────────────────────── */}
        <div className="mb-10 text-center">
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light">
            Sponsor Portal
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(1.875rem,3vw,2.75rem)] leading-[1.1] text-ivory">
            {data.event?.title ?? 'Your sponsorship'}
          </h1>
          <p className="mt-4 font-[family-name:var(--font-editorial)] text-[15px] italic text-ivory-soft">
            Welcome, {data.sponsorLabel} — your {data.packageName} partnership
            {data.showcaseSlot ? ` · ${data.showcaseSlot}` : ''}.
          </p>
        </div>

        <div className="space-y-6">
          {/* ── Event ──────────────────────────────────────────────── */}
          {data.event && (
            <Section icon={<Calendar size={16} strokeWidth={1.6} />} eyebrow="Your event" title={data.event.title}>
              <div className="space-y-2.5">
                <p className="flex items-center gap-2.5 text-[14.5px] text-ivory-soft">
                  <Calendar size={15} className="text-bronze-light" strokeWidth={1.6} />
                  {fmtDate(data.event.start_date)}
                </p>
                {(data.event.venue_name || data.event.venue_city) && (
                  <p className="flex items-center gap-2.5 text-[14.5px] text-ivory-soft">
                    <MapPin size={15} className="text-bronze-light" strokeWidth={1.6} />
                    {[data.event.venue_name, data.event.venue_city].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
            </Section>
          )}

          {/* ── Assets required ────────────────────────────────────── */}
          <Section icon={<ImageIcon size={16} strokeWidth={1.6} />} eyebrow="What we need from you" title="Assets required">
            <DeliverableList items={assets} token={token} />
          </Section>

          {/* ── Branding deadlines ─────────────────────────────────── */}
          <Section icon={<Megaphone size={16} strokeWidth={1.6} />} eyebrow="Key dates" title="Branding deadlines">
            <DeliverableList items={branding} token={token} />
          </Section>

          {/* ── Guest allocation ───────────────────────────────────── */}
          <Section icon={<Users size={16} strokeWidth={1.6} />} eyebrow="Your places" title="Guest allocation">
            <DeliverableList items={guests} token={token} />
          </Section>

          {/* ── Other ──────────────────────────────────────────────── */}
          {other.length > 0 && (
            <Section icon={<ClipboardList size={16} strokeWidth={1.6} />} eyebrow="Also on the list" title="Other deliverables">
              <DeliverableList items={other} token={token} />
            </Section>
          )}

          {/* ── ROI report (post-event) ────────────────────────────── */}
          {data.roiReportHtml && (
            <Section icon={<BarChart3 size={16} strokeWidth={1.6} />} eyebrow="After the evening" title="Your ROI report">
              {typeof data.roiReach === 'number' && (
                <div className="mb-5 flex items-baseline gap-3">
                  <span className="font-[family-name:var(--font-display)] text-[34px] leading-none text-ivory tabular-nums">
                    {data.roiReach}
                  </span>
                  <span className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.24em] text-bronze-light">
                    guests reached
                  </span>
                </div>
              )}
              <iframe
                title="ROI report"
                srcDoc={data.roiReportHtml}
                className="h-[720px] w-full rounded-md border border-graphite-line/50 bg-white"
              />
            </Section>
          )}
        </div>

        <footer className="mt-14 text-center">
          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.24em] text-ivory-soft/50">
            The Club by Sarah Restrick · Private sponsor portal
          </p>
        </footer>
      </div>
    </main>
  )
}
