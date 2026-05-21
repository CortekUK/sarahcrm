'use client'

import { useRef, useEffect } from 'react'
import Link from 'next/link'
import { useTheme, themeColors } from '../ThemeContext'
import { MagneticButton } from '../MagneticButton'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import type { Database } from '@/types/database'

gsap.registerPlugin(ScrollTrigger)

type Event = Database['public']['Tables']['events']['Row']

interface EventDetailContentProps {
  event: Event
  isPast: boolean
}

export function EventDetailContent({ event, isPast }: EventDetailContentProps) {
  const { mode } = useTheme()
  const t = themeColors[mode].light
  const contentRef = useRef<HTMLDivElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const ctx = gsap.context(() => {
      if (contentRef.current) {
        gsap.from(contentRef.current, {
          y: 40,
          opacity: 0,
          duration: 1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: contentRef.current,
            start: 'top 85%',
            once: true,
          },
        })
      }

      if (sidebarRef.current) {
        gsap.from(sidebarRef.current, {
          y: 40,
          opacity: 0,
          duration: 1,
          delay: 0.2,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: sidebarRef.current,
            start: 'top 85%',
            once: true,
          },
        })
      }
    })

    return () => ctx.revert()
  }, [])

  const agenda = event.agenda as Array<{ time: string; item: string }> | null
  const speakers = event.speakers as Array<{ name: string; role?: string }> | null

  return (
    <section
      className="py-16 md:py-24 transition-colors duration-[400ms]"
      style={{ backgroundColor: t.bg }}
    >
      <div className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20">
          {/* Main content */}
          <div ref={contentRef} className="lg:col-span-7">
            {event.description && (
              <p
                className="font-[family-name:var(--font-body)] text-lg leading-relaxed whitespace-pre-line transition-colors duration-[400ms]"
                style={{ color: (t as Record<string, string>).textSecondary ?? t.text }}
              >
                {event.description}
              </p>
            )}

            {/* Agenda */}
            {agenda && agenda.length > 0 && (
              <div className="mt-12">
                <h3
                  className="font-[family-name:var(--font-label)] text-[0.65rem] font-medium uppercase tracking-[0.2em] text-[#B8975A] mb-6"
                >
                  Agenda
                </h3>
                <div className="space-y-4">
                  {agenda.map((item, i) => (
                    <div
                      key={i}
                      className="flex gap-6 py-3 transition-colors duration-[400ms]"
                      style={{ borderBottom: `1px solid ${t.border}` }}
                    >
                      <span
                        className="font-[family-name:var(--font-label)] text-[0.7rem] uppercase tracking-wider shrink-0 w-20"
                        style={{ color: t.textMuted }}
                      >
                        {item.time}
                      </span>
                      <span
                        className="font-[family-name:var(--font-body)] text-base"
                        style={{ color: t.text }}
                      >
                        {item.item}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Speakers */}
            {speakers && speakers.length > 0 && (
              <div className="mt-12">
                <h3
                  className="font-[family-name:var(--font-label)] text-[0.65rem] font-medium uppercase tracking-[0.2em] text-[#B8975A] mb-6"
                >
                  Speakers
                </h3>
                <div className="space-y-3">
                  {speakers.map((speaker, i) => (
                    <div key={i}>
                      <span
                        className="font-[family-name:var(--font-body)] text-base font-medium"
                        style={{ color: t.text }}
                      >
                        {speaker.name}
                      </span>
                      {speaker.role && (
                        <span
                          className="font-[family-name:var(--font-body)] text-sm ml-2"
                          style={{ color: t.textMuted }}
                        >
                          — {speaker.role}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside ref={sidebarRef} className="lg:col-span-4 lg:col-start-9">
            <div
              className="sticky top-28 p-8 transition-all duration-[400ms]"
              style={{
                backgroundColor: mode === 'evening' ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
                border: `1px solid ${t.border}`,
              }}
            >
              <h3 className="font-[family-name:var(--font-label)] text-[0.65rem] font-medium uppercase tracking-[0.2em] text-[#B8975A] mb-6">
                Event Details
              </h3>

              <div className="space-y-4">
                <div>
                  <span
                    className="text-xs uppercase tracking-wider transition-colors duration-[400ms]"
                    style={{ color: t.textMuted }}
                  >
                    Date
                  </span>
                  <p
                    className="text-sm font-medium mt-0.5 transition-colors duration-[400ms]"
                    style={{ color: t.text }}
                  >
                    {new Date(event.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>

                {event.doors_open && (
                  <div>
                    <span
                      className="text-xs uppercase tracking-wider transition-colors duration-[400ms]"
                      style={{ color: t.textMuted }}
                    >
                      Doors Open
                    </span>
                    <p
                      className="text-sm font-medium mt-0.5 transition-colors duration-[400ms]"
                      style={{ color: t.text }}
                    >
                      {new Date(event.doors_open).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()}
                    </p>
                  </div>
                )}

                {event.venue_name && (
                  <div>
                    <span
                      className="text-xs uppercase tracking-wider transition-colors duration-[400ms]"
                      style={{ color: t.textMuted }}
                    >
                      Venue
                    </span>
                    <p
                      className="text-sm font-medium mt-0.5 transition-colors duration-[400ms]"
                      style={{ color: t.text }}
                    >
                      {event.venue_url ? (
                        <a
                          href={event.venue_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[#B8975A] transition-colors"
                        >
                          {event.venue_name}
                        </a>
                      ) : (
                        event.venue_name
                      )}
                      {event.venue_city && (
                        <span style={{ color: t.textMuted, fontWeight: 'normal' }}>, {event.venue_city}</span>
                      )}
                    </p>
                  </div>
                )}

                <div>
                  <span
                    className="text-xs uppercase tracking-wider transition-colors duration-[400ms]"
                    style={{ color: t.textMuted }}
                  >
                    Member Price
                  </span>
                  <p
                    className="text-sm font-medium mt-0.5 transition-colors duration-[400ms]"
                    style={{ color: t.text }}
                  >
                    {event.member_price_pence === 0 ? 'Complimentary' : `£${(event.member_price_pence / 100).toFixed(0)}`}
                  </p>
                </div>

                {event.guest_price_pence > 0 && (
                  <div>
                    <span
                      className="text-xs uppercase tracking-wider transition-colors duration-[400ms]"
                      style={{ color: t.textMuted }}
                    >
                      Guest Price
                    </span>
                    <p
                      className="text-sm font-medium mt-0.5 transition-colors duration-[400ms]"
                      style={{ color: t.text }}
                    >
                      £{(event.guest_price_pence / 100).toFixed(0)}
                    </p>
                  </div>
                )}
              </div>

              <div
                className="mt-8 pt-6 transition-colors duration-[400ms]"
                style={{ borderTop: `1px solid ${t.border}` }}
              >
                {isPast ? (
                  <p
                    className="text-sm text-center transition-colors duration-[400ms]"
                    style={{ color: t.textMuted }}
                  >
                    This event has ended.
                  </p>
                ) : (
                  <>
                    {/*
                      Deep-link to the member portal booking page. Auth-gated
                      via middleware — non-members get bounced to /login with
                      a redirect param back to this booking page. Avoids the
                      old "Book as Member → /login (orphan)" dead-end.
                    */}
                    <MagneticButton strength={0.2}>
                      <Link
                        href={`/portal/events/${event.id}`}
                        className="group block w-full text-center px-6 py-3.5 bg-[#B8975A] hover:bg-[#D4B978] text-white text-sm font-medium tracking-wide transition-all duration-500 inline-flex items-center justify-center gap-2"
                      >
                        Book your place
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-0.5">
                          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </Link>
                    </MagneticButton>
                    <p
                      className="text-[11px] text-center mt-3 leading-relaxed transition-colors duration-[400ms]"
                      style={{ color: t.textMuted }}
                    >
                      Members book directly · Not yet a member?{' '}
                      <Link href="/membership-application" className="text-[#B8975A] hover:underline">
                        Apply here
                      </Link>
                    </p>
                    {event.event_type === 'curated_luxury' && (
                      <Link
                        href="/contact-us"
                        className="block text-center mt-4 pt-4 border-t text-[11px] font-[family-name:var(--font-label)] uppercase tracking-[0.2em] hover:text-[#B8975A] transition-colors"
                        style={{ borderColor: t.border, color: t.textDim }}
                      >
                        Or enquire about a bespoke version →
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  )
}
