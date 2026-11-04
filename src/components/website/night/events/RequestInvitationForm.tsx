'use client'

import Link from 'next/link'
import { Lock } from 'lucide-react'
import { SiteForm } from '@/components/website/forms/SiteForm'

// ─────────────────────────────────────────────────────────────────────
// "Request an invitation" (invitation-only events) / "Join the waitlist"
// (waitlist + sold-out events) on /events/[slug].
//
// Built on the shared SiteForm, so it posts to /api/enquiries/intake with
// source "Web/App – Event" (events@ inbox, intent 'event') and files the
// event context in form_data: { event_id, event_slug, event_title,
// request, places, dietary }. No payment — the team confirms places.
// ─────────────────────────────────────────────────────────────────────

export interface InvitationEvent {
  id: string
  slug: string
  title: string
  dateLabel: string
}

type Mode = 'invitation' | 'waitlist'

const COPY: Record<Mode, { eyebrow: string; intro: string; cta: string; thanks: string }> = {
  invitation: {
    eyebrow: 'Request an invitation',
    intro: 'Guests attend by invitation. Tell us a little about yourself and the events team will be in touch.',
    cta: 'Request an invitation',
    thanks: 'Your request is with the events team.',
  },
  waitlist: {
    eyebrow: 'Join the waitlist',
    intro: 'This event is full. Leave your details and we’ll offer you a place if one opens up.',
    cta: 'Join the waitlist',
    thanks: 'You’re on the waitlist.',
  },
}

export function RequestInvitationForm({
  event,
  mode = 'invitation',
  heading,
}: {
  event: InvitationEvent
  mode?: Mode
  /** Optional status line above the form, e.g. "Sold out". */
  heading?: string
}) {
  const copy = COPY[mode]
  return (
    <div className="border border-bronze/40 bg-graphite/50 backdrop-blur-sm rounded-2xl p-7 lg:p-8">
      {heading && (
        <p className="mb-3 font-[family-name:var(--font-display)] text-[1.5rem] leading-tight text-ivory">{heading}</p>
      )}
      <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-4">
        {copy.eyebrow}
      </p>
      <p className="mb-6 font-[family-name:var(--font-editorial)] italic text-[15px] leading-[1.7] text-ivory-soft">
        {copy.intro}
      </p>

      <SiteForm
        source="Web/App – Event"
        context={{
          event_id: event.id,
          event_slug: event.slug,
          event_title: `${event.title} (${event.dateLabel})`,
          request: mode,
        }}
        initialValues={{ places: '1' }}
        fields={[
          { type: 'text', name: 'company', label: 'Company (optional)' },
          { type: 'select', name: 'places', label: 'Places', required: true, options: ['1', '2', '3', '4'] },
          { type: 'text', name: 'dietary', label: 'Dietary requirements (optional)' },
          { type: 'textarea', name: 'message', label: 'Anything we should know (optional)', rows: 3 },
        ]}
        submitLabel={copy.cta}
        thankYou={{
          title: copy.thanks,
          body: 'We’ll be in touch by email to confirm.',
          nextStep: { label: 'See the calendar', href: '/events' },
        }}
      />

      <div className="pt-5 mt-6 border-t border-graphite-line/50 flex items-center justify-between gap-3">
        <p className="font-[family-name:var(--font-editorial)] italic text-[12.5px] text-ivory-soft/85">
          The Club Member?
        </p>
        <Link
          href={`/login?redirect=${encodeURIComponent(`/portal/events/${event.id}`)}`}
          className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light hover:text-ivory transition-colors duration-300"
        >
          <Lock size={11} strokeWidth={1.5} />
          Sign in to reserve
        </Link>
      </div>
    </div>
  )
}
