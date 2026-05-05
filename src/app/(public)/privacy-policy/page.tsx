'use client'

import { useTheme, themeColors } from '@/components/website/ThemeContext'
import { useReveal } from '@/components/website/home/useReveal'

export default function PrivacyPolicyPage() {
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
            Legal
          </span>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl md:text-4xl lg:text-5xl font-light text-white leading-[1.1]">
            Privacy Policy
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
                Introduction
              </h2>
              <div
                className="space-y-3 text-sm leading-relaxed transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>The Club by Sarah Restrick (&ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your personal information.</p>
                <p>We are registered in England and Wales. Our registered address is 1 London Road, Alderley Edge, Cheshire, SK9 7JT.</p>
              </div>
            </div>

            <div>
              <h2
                className="font-[family-name:var(--font-heading)] text-xl mb-4 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                Information We Collect
              </h2>
              <div
                className="space-y-3 text-sm leading-relaxed transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>We may collect the following information:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Name, email address, phone number, and company details (provided via forms)</li>
                  <li>Membership application information including professional background</li>
                  <li>Event booking and attendance records</li>
                  <li>Payment information (processed securely via Stripe — we do not store card details)</li>
                  <li>Website usage data via analytics cookies</li>
                </ul>
              </div>
            </div>

            <div>
              <h2
                className="font-[family-name:var(--font-heading)] text-xl mb-4 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                How We Use Your Information
              </h2>
              <div
                className="space-y-3 text-sm leading-relaxed transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>We use personal information to:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Process membership applications and manage memberships</li>
                  <li>Organise and manage events, bookings, and introductions</li>
                  <li>Communicate about club activities, events, and opportunities</li>
                  <li>Improve our services and member experience</li>
                  <li>Comply with legal and regulatory obligations</li>
                </ul>
              </div>
            </div>

            <div>
              <h2
                className="font-[family-name:var(--font-heading)] text-xl mb-4 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                Data Sharing
              </h2>
              <div
                className="space-y-3 text-sm leading-relaxed transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>We do not sell your personal data to third parties. We may share information with:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Service providers who assist in operating The Club (payment processors, email providers)</li>
                  <li>Other members, only with your explicit consent (e.g., for introductions)</li>
                  <li>Legal authorities where required by law</li>
                </ul>
              </div>
            </div>

            <div>
              <h2
                className="font-[family-name:var(--font-heading)] text-xl mb-4 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                Your Rights
              </h2>
              <div
                className="space-y-3 text-sm leading-relaxed transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>Under UK GDPR, you have the right to:</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Access the personal data we hold about you</li>
                  <li>Request correction of inaccurate data</li>
                  <li>Request deletion of your data (right to be forgotten)</li>
                  <li>Object to processing of your data</li>
                  <li>Request data portability</li>
                  <li>Withdraw consent at any time</li>
                </ul>
                <p>To exercise any of these rights, please contact us at hello@theclubsarahrestrick.com.</p>
              </div>
            </div>

            <div>
              <h2
                className="font-[family-name:var(--font-heading)] text-xl mb-4 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                Cookies
              </h2>
              <div
                className="space-y-3 text-sm leading-relaxed transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>Our website uses essential cookies for functionality and analytics cookies to understand how visitors use our site. You can disable non-essential cookies in your browser settings.</p>
              </div>
            </div>

            <div>
              <h2
                className="font-[family-name:var(--font-heading)] text-xl mb-4 transition-colors duration-[400ms]"
                style={{ color: warm.text }}
              >
                Contact
              </h2>
              <div
                className="space-y-3 text-sm leading-relaxed transition-colors duration-[400ms]"
                style={{ color: warm.textMuted }}
              >
                <p>For any privacy-related enquiries, please contact our data protection officer at hello@theclubsarahrestrick.com or write to us at our registered address.</p>
              </div>
            </div>

            <div
              className="pt-6 transition-colors duration-[400ms]"
              style={{ borderTop: `1px solid ${warm.border}` }}
            >
              <p className="text-xs" style={{ color: warm.textDim }}>
                Last updated: January 2026. We may update this policy from time to time.
                Material changes will be communicated to members directly.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
