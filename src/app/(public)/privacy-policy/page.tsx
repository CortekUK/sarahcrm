import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'

// Privacy Policy — quiet legal page, night palette. Long-form column,
// no hero photography (legal content doesn't need cinematic framing).

export const metadata = {
  title: 'Privacy Policy — The Club by Sarah Restrick',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="pt-32">
      <Chapter density="default" bg="ink">
        <div className="max-w-2xl">
          <EditorialMeta label="Privacy" stamp="Last updated 2026" />
          <h1 className="display-lg mt-10 mb-12">Privacy Policy</h1>

          <div className="body-prose space-y-7 max-w-prose">
            <p>
              The Club by Sarah Restrick collects only the personal information needed to run a private members club: names, contact details, professional information you share when applying, and event attendance records.
            </p>

            <h2 className="font-[family-name:var(--font-display)] text-2xl text-ivory mt-12">
              What we collect
            </h2>
            <p>
              When you apply for membership, we collect your name, email, phone number, employer, role, and any biographical detail you choose to share. When you attend an event, we record your attendance, any dietary requirements, and — for paid events — payment confirmation.
            </p>

            <h2 className="font-[family-name:var(--font-display)] text-2xl text-ivory mt-12">
              What we don&apos;t do
            </h2>
            <p>
              We never publish member names. We never sell or share personal information with third parties for marketing purposes. We don&apos;t use behavioural advertising or invasive analytics. We don&apos;t send unsolicited email.
            </p>

            <h2 className="font-[family-name:var(--font-display)] text-2xl text-ivory mt-12">
              Your data, your choice
            </h2>
            <p>
              You can ask us to delete your data at any time by writing to <a href="mailto:hello@theclubbysarahrestrick.com" className="text-bronze-light hover:text-ivory transition-colors">hello@theclubbysarahrestrick.com</a>. We&apos;ll confirm deletion within fourteen days, keeping only the minimum records required by UK law for accounting and safeguarding purposes.
            </p>

            <h2 className="font-[family-name:var(--font-display)] text-2xl text-ivory mt-12">
              Payments
            </h2>
            <p>
              Card payments are processed by Stripe. We don&apos;t store card numbers. Stripe&apos;s privacy policy governs how they handle payment data.
            </p>

            <h2 className="font-[family-name:var(--font-display)] text-2xl text-ivory mt-12">
              Cookies
            </h2>
            <p>
              The site uses only essential cookies — for session authentication and for measuring whether features work. No advertising trackers, no cross-site tracking.
            </p>

            <h2 className="font-[family-name:var(--font-display)] text-2xl text-ivory mt-12">
              Contact
            </h2>
            <p>
              For any privacy question, write to{' '}
              <a href="mailto:hello@theclubbysarahrestrick.com" className="text-bronze-light hover:text-ivory transition-colors">
                hello@theclubbysarahrestrick.com
              </a>
              . A real person reads it.
            </p>
          </div>
        </div>
      </Chapter>
    </div>
  )
}
