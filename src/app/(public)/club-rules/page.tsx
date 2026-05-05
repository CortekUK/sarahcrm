'use client'

import { useTheme, themeColors } from '@/components/website/ThemeContext'
import { useReveal } from '@/components/website/home/useReveal'

export default function ClubRulesPage() {
  const { mode } = useTheme()
  const dark = themeColors[mode].dark
  const warm = themeColors[mode].warm
  const contentReveal = useReveal({ threshold: 0.05, y: 30 })

  return (
    <>
      {/* Hero */}
      <section
        className="pt-32 pb-16 md:pt-40 md:pb-20 transition-colors duration-[400ms]"
        style={{ backgroundColor: dark.bg }}
      >
        <div className="max-w-[1440px] mx-auto px-6 md:px-16 lg:px-24">
          <span className="font-[family-name:var(--font-label)] text-[0.6rem] font-medium uppercase tracking-[0.3em] text-[#B8975A] mb-4 block">
            Governance
          </span>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl lg:text-5xl font-light text-white leading-[1.1]">
            Club Rules
          </h1>
        </div>
      </section>

      {/* Content */}
      <section
        className="py-20 md:py-28 transition-colors duration-[400ms]"
        style={{ backgroundColor: warm.bg }}
      >
        <div
          ref={contentReveal.ref}
          className="max-w-3xl mx-auto px-6 md:px-16 lg:px-24"
        >
          <div className="space-y-10" style={{ color: warm.text }}>
            <div>
              <h2
                className="font-[family-name:var(--font-heading)] text-xl mb-4 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                1. Membership
              </h2>
              <div
                className="space-y-3 text-sm leading-relaxed transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>Membership of The Club by Sarah Restrick is by application and invitation only. The Club reserves the right to accept or decline any application at its sole discretion.</p>
                <p>Members must be over 21 years of age and demonstrate a commitment to professional excellence and community contribution.</p>
                <p>Membership fees are non-refundable and payable annually in advance.</p>
              </div>
            </div>

            <div>
              <h2
                className="font-[family-name:var(--font-heading)] text-xl mb-4 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                2. Conduct
              </h2>
              <div
                className="space-y-3 text-sm leading-relaxed transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>Members are expected to conduct themselves with professionalism, discretion, and respect at all times — both at club events and within our digital community.</p>
                <p>Aggressive solicitation, uninvited sales approaches, or any behaviour that makes other members uncomfortable will not be tolerated.</p>
                <p>The Club operates a zero-tolerance policy on discrimination of any kind.</p>
              </div>
            </div>

            <div>
              <h2
                className="font-[family-name:var(--font-heading)] text-xl mb-4 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                3. Confidentiality
              </h2>
              <div
                className="space-y-3 text-sm leading-relaxed transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>What is discussed at Club events and within our community is confidential. Members agree not to share business details, personal information, or conversations without explicit consent.</p>
                <p>Photography at events is permitted for personal use only unless otherwise stated. Professional photography and social media content is managed exclusively by The Club&apos;s team.</p>
              </div>
            </div>

            <div>
              <h2
                className="font-[family-name:var(--font-heading)] text-xl mb-4 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                4. Events &amp; Bookings
              </h2>
              <div
                className="space-y-3 text-sm leading-relaxed transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>Event bookings are confirmed upon payment. Cancellations made more than 7 days before an event will receive a full refund. Cancellations within 7 days are non-refundable but may be transferable to another member.</p>
                <p>Members may bring guests to selected events at the guest rate. Guests must adhere to all club rules during their attendance.</p>
              </div>
            </div>

            <div>
              <h2
                className="font-[family-name:var(--font-heading)] text-xl mb-4 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                5. Termination
              </h2>
              <div
                className="space-y-3 text-sm leading-relaxed transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>The Club reserves the right to terminate any membership without refund if a member breaches these rules or acts in a manner that is detrimental to the club or its members.</p>
                <p>Members may resign their membership at any time by providing written notice. No refund of remaining subscription is provided.</p>
              </div>
            </div>

            <div
              className="pt-6 transition-colors duration-[400ms]"
              style={{ borderTop: `1px solid ${warm.border}` }}
            >
              <p className="text-xs" style={{ color: warm.textDim }}>
                Last updated: January 2026. The Club reserves the right to amend these rules at any time.
                Members will be notified of material changes.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
