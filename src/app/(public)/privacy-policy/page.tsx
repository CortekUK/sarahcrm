import type { ReactNode } from 'react'
import { PageHeroMedia } from '@/components/website/night/primitives/PageHeroMedia'
import { Chapter, EditorialMeta } from '@/components/website/night/primitives/Chapter'
import { TracingBeam } from '@/components/website/night/effects/TracingBeam'
import { Reveal } from '@/components/website/night/effects/Reveal'
import { ApplyClose } from '@/components/website/night/home/ApplyClose'
import { getPageHero } from '@/lib/cms/heroes'
import { ArrowUpRight } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────
// Privacy Policy — Sarah's full notice, set in the editorial vocabulary
// established on /club-rules.
//
// All notice copy below is VERBATIM from Sarah's source (provided
// 2026-05-25, originally published 13 September 2022). Only the
// section framing (eyebrows, hero scaffolding, the TOC) is our own.
//
// Composition:
//   01 Hero
//   02 Preamble — intro paragraph + last-updated stamp
//   03 Summary of key points — short Q&A blocks, each links to the
//      matching detailed section below
//   04 Table of contents — clickable list, jumps to any section
//   05 The 13 sections — each with a `scroll-mt-24` anchor target so
//      the sticky header doesn't cover the heading on jump
//   06 Closing
//   07 Apply close
// ─────────────────────────────────────────────────────────────────────

export const metadata = {
  title: 'Privacy Policy — The Club by Sarah Restrick',
}

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=2400&q=85'

const LAST_UPDATED = '13 September 2022'
const CONTACT_EMAIL = 'sarah@theclubbysarahrestrick.com'

// Shared external-link styling
const linkClass =
  'text-bronze-light hover:text-ivory underline decoration-bronze/40 hover:decoration-bronze underline-offset-4 transition-colors duration-300 break-words'

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
      {children}
    </a>
  )
}

function MailLink() {
  return <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>{CONTACT_EMAIL}</a>
}

function SectionJump({ id, children }: { id: string; children: ReactNode }) {
  return (
    <a href={`#${id}`} className={linkClass}>
      {children}
    </a>
  )
}

// ─── Summary of Key Points ────────────────────────────────────────────
const SUMMARY = [
  {
    q: 'What personal information do we process?',
    a: 'When you visit, use, or navigate our Services, we may process personal information depending on how you interact with The Club by Sarah Restrick and the Services, the choices you make, and the products and features you use.',
    link: 'section-01',
  },
  {
    q: 'Do we process any sensitive personal information?',
    a: 'We do not process sensitive personal information.',
    link: 'section-01',
  },
  {
    q: 'Do we receive any information from third parties?',
    a: 'We do not receive any information from third parties.',
    link: 'section-01',
  },
  {
    q: 'How do we process your information?',
    a: 'We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We may also process your information for other purposes with your consent. We process your information only when we have a valid legal reason to do so.',
    link: 'section-02',
  },
  {
    q: 'In what situations and with which parties do we share personal information?',
    a: 'We may share information in specific situations and with specific third parties.',
    link: 'section-03',
  },
  {
    q: 'How do we keep your information safe?',
    a: 'We have organisational and technical processes and procedures in place to protect your personal information. However, no electronic transmission over the internet or information storage technology can be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers, cybercriminals, or other unauthorised third parties will not be able to defeat our security and improperly collect, access, steal, or modify your information.',
    link: 'section-06',
  },
  {
    q: 'What are your rights?',
    a: 'Depending on where you are located geographically, the applicable privacy law may mean you have certain rights regarding your personal information.',
    link: 'section-08',
  },
  {
    q: 'How do you exercise your rights?',
    a: 'The easiest way to exercise your rights is by contacting us. We will consider and act upon any request in accordance with applicable data protection laws.',
    link: 'section-08',
  },
] as const

// ─── The 13 sections ─────────────────────────────────────────────────
interface Section {
  id: string
  n: string
  headline: string
  short?: string
  body: ReactNode
}

const SECTIONS: Section[] = [
  {
    id: 'section-01',
    n: '01',
    headline: 'What information do we collect?',
    body: (
      <>
        <p>
          <em className="italic text-bronze-light">Personal information you disclose to us.</em>
        </p>
        <p>
          <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.28em] text-bronze-light/85 mr-2">
            In short
          </span>
          <span className="italic">We collect personal information that you provide to us.</span>
        </p>
        <p>
          We collect personal information that you voluntarily provide to us when you register on
          the Services, express an interest in obtaining information about us or our products and
          Services, when you participate in activities on the Services, or otherwise when you
          contact us.
        </p>
        <p>
          <em className="italic text-bronze-light">Personal Information Provided by You.</em> The
          personal information that we collect depends on the context of your interactions with us
          and the Services, the choices you make, and the products and features you use. The
          personal information we collect may include the following:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-1.5 marker:text-bronze/60">
          <li>names</li>
          <li>email addresses</li>
          <li>phone numbers</li>
          <li>job titles</li>
        </ul>
        <p>
          <em className="italic text-bronze-light">Sensitive Information.</em> We do not process
          sensitive information.
        </p>
        <p>
          All personal information that you provide to us must be true, complete, and accurate, and
          you must notify us of any changes to such personal information.
        </p>
      </>
    ),
  },
  {
    id: 'section-02',
    n: '02',
    headline: 'How do we process your information?',
    short:
      'We process your information to provide, improve, and administer our Services, communicate with you, for security and fraud prevention, and to comply with law. We may also process your information for other purposes with your consent.',
    body: (
      <>
        <p>
          We process your personal information for a variety of reasons, depending on how you
          interact with our Services, including:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-3 marker:text-bronze/60">
          <li>
            <em className="italic text-bronze-light">
              To facilitate account creation and authentication and otherwise manage user accounts.
            </em>{' '}
            We may process your information so you can create and log in to your account, as well
            as keep your account in working order.
          </li>
          <li>
            <em className="italic text-bronze-light">To comply with our legal obligations.</em> We
            may process your information to comply with our legal obligations, respond to legal
            requests, and exercise, establish, or defend our legal rights.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'section-03',
    n: '03',
    headline: 'When and with whom do we share your personal information?',
    short:
      'We may share information in specific situations described in this section and/or with the following third parties.',
    body: (
      <>
        <p>We may need to share your personal information in the following situations:</p>
        <ul className="list-disc list-outside pl-6 space-y-3 marker:text-bronze/60">
          <li>
            <em className="italic text-bronze-light">Business Transfers.</em> We may share or
            transfer your information in connection with, or during negotiations of, any merger,
            sale of company assets, financing, or acquisition of all or a portion of our business
            to another company.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'section-04',
    n: '04',
    headline: 'Do we use cookies and other tracking technologies?',
    short: 'We may use cookies and other tracking technologies to collect and store your information.',
    body: (
      <p>
        We may use cookies and similar tracking technologies (like web beacons and pixels) to
        access or store information. Specific information about how we use such technologies and
        how you can refuse certain cookies is set out in our Cookie Notice.
      </p>
    ),
  },
  {
    id: 'section-05',
    n: '05',
    headline: 'How long do we keep your information?',
    short:
      'We keep your information for as long as necessary to fulfil the purposes outlined in this privacy notice unless otherwise required by law.',
    body: (
      <>
        <p>
          We will only keep your personal information for as long as it is necessary for the
          purposes set out in this privacy notice, unless a longer retention period is required or
          permitted by law (such as tax, accounting, or other legal requirements). No purpose in
          this notice will require us keeping your personal information for longer than the period
          of time in which users have an account with us.
        </p>
        <p>
          When we have no ongoing legitimate business need to process your personal information,
          we will either delete or anonymise such information, or, if this is not possible (for
          example, because your personal information has been stored in backup archives), then we
          will securely store your personal information and isolate it from any further processing
          until deletion is possible.
        </p>
      </>
    ),
  },
  {
    id: 'section-06',
    n: '06',
    headline: 'How do we keep your information safe?',
    short:
      'We aim to protect your personal information through a system of organisational and technical security measures.',
    body: (
      <p>
        We have implemented appropriate and reasonable technical and organisational security
        measures designed to protect the security of any personal information we process. However,
        despite our safeguards and efforts to secure your information, no electronic transmission
        over the Internet or information storage technology can be guaranteed to be 100% secure,
        so we cannot promise or guarantee that hackers, cybercriminals, or other unauthorised
        third parties will not be able to defeat our security and improperly collect, access,
        steal, or modify your information. Although we will do our best to protect your personal
        information, transmission of personal information to and from our Services is at your own
        risk. You should only access the Services within a secure environment.
      </p>
    ),
  },
  {
    id: 'section-07',
    n: '07',
    headline: 'Do we collect information from minors?',
    short: 'We do not knowingly collect data from or market to children under 18 years of age.',
    body: (
      <p>
        We do not knowingly solicit data from or market to children under 18 years of age. By
        using the Services, you represent that you are at least 18 or that you are the parent or
        guardian of such a minor and consent to such minor dependent&rsquo;s use of the Services.
        If we learn that personal information from users less than 18 years of age has been
        collected, we will deactivate the account and take reasonable measures to promptly delete
        such data from our records. If you become aware of any data we may have collected from
        children under age 18, please contact us at <MailLink />.
      </p>
    ),
  },
  {
    id: 'section-08',
    n: '08',
    headline: 'What are your privacy rights?',
    short: 'You may review, change, or terminate your account at any time.',
    body: (
      <>
        <p>
          If you are located in the EEA or UK and you believe we are unlawfully processing your
          personal information, you also have the right to complain to your local data protection
          supervisory authority. You can find their contact details here:{' '}
          <Ext href="https://ec.europa.eu/justice/data-protection/bodies/authorities/index_en.htm">
            https://ec.europa.eu/justice/data-protection/bodies/authorities/index_en.htm
          </Ext>
          .
        </p>
        <p>
          If you are located in Switzerland, the contact details for the data protection
          authorities are available here:{' '}
          <Ext href="https://www.edoeb.admin.ch/edoeb/en/home.html">
            https://www.edoeb.admin.ch/edoeb/en/home.html
          </Ext>
          .
        </p>
        <p>
          <em className="italic text-bronze-light">Withdrawing your consent:</em> If we are relying
          on your consent to process your personal information, which may be express and/or
          implied consent depending on the applicable law, you have the right to withdraw your
          consent at any time. You can withdraw your consent at any time by contacting us by using
          the contact details provided in the section{' '}
          <SectionJump id="section-12">
            &lsquo;How can you contact us about this notice?&rsquo;
          </SectionJump>{' '}
          below.
        </p>
        <p>
          However, please note that this will not affect the lawfulness of the processing before
          its withdrawal nor, when applicable law allows, will it affect the processing of your
          personal information conducted in reliance on lawful processing grounds other than
          consent.
        </p>

        <p className="font-[family-name:var(--font-display)] text-ivory text-[1.375rem] leading-tight pt-4">
          Account Information
        </p>
        <p>
          If you would at any time like to review or change the information in your account or
          terminate your account, you can:
        </p>
        <ul className="list-disc list-outside pl-6 space-y-1.5 marker:text-bronze/60">
          <li>Contact us using the contact information provided.</li>
        </ul>
        <p>
          Upon your request to terminate your account, we will deactivate or delete your account
          and information from our active databases. However, we may retain some information in
          our files to prevent fraud, troubleshoot problems, assist with any investigations,
          enforce our legal terms and/or comply with applicable legal requirements.
        </p>
        <p>
          <em className="italic text-bronze-light">Cookies and similar technologies:</em> Most Web
          browsers are set to accept cookies by default. If you prefer, you can usually choose to
          set your browser to remove cookies and to reject cookies. If you choose to remove
          cookies or reject cookies, this could affect certain features or services of our
          Services. To opt out of interest-based advertising by advertisers on our Services visit{' '}
          <Ext href="http://www.aboutads.info/choices/">http://www.aboutads.info/choices/</Ext>.
        </p>
        <p>
          If you have questions or comments about your privacy rights, you may email us at{' '}
          <MailLink />.
        </p>
      </>
    ),
  },
  {
    id: 'section-09',
    n: '09',
    headline: 'Controls for do-not-track features.',
    body: (
      <p>
        Most web browsers and some mobile operating systems and mobile applications include a
        Do-Not-Track (&lsquo;DNT&rsquo;) feature or setting you can activate to signal your
        privacy preference not to have data about your online browsing activities monitored and
        collected. At this stage no uniform technology standard for recognising and implementing
        DNT signals has been finalised. As such, we do not currently respond to DNT browser
        signals or any other mechanism that automatically communicates your choice not to be
        tracked online. If a standard for online tracking is adopted that we must follow in the
        future, we will inform you about that practice in a revised version of this privacy
        notice.
      </p>
    ),
  },
  {
    id: 'section-10',
    n: '10',
    headline: 'Do California residents have specific privacy rights?',
    short:
      'Yes, if you are a resident of California, you are granted specific rights regarding access to your personal information.',
    body: (
      <>
        <p>
          California Civil Code Section 1798.83, also known as the &lsquo;Shine The Light&rsquo;
          law, permits our users who are California residents to request and obtain from us, once
          a year and free of charge, information about categories of personal information (if any)
          we disclosed to third parties for direct marketing purposes and the names and addresses
          of all third parties with which we shared personal information in the immediately
          preceding calendar year. If you are a California resident and would like to make such a
          request, please submit your request in writing to us using the contact information
          provided below.
        </p>
        <p>
          If you are under 18 years of age, reside in California, and have a registered account
          with Services, you have the right to request removal of unwanted data that you publicly
          post on the Services. To request removal of such data, please contact us using the
          contact information provided below and include the email address associated with your
          account and a statement that you reside in California. We will make sure the data is not
          publicly displayed on the Services, but please be aware that the data may not be
          completely or comprehensively removed from all our systems (e.g. backups, etc.).
        </p>
      </>
    ),
  },
  {
    id: 'section-11',
    n: '11',
    headline: 'Do we make updates to this notice?',
    short: 'Yes, we will update this notice as necessary to stay compliant with relevant laws.',
    body: (
      <p>
        We may update this privacy notice from time to time. The updated version will be indicated
        by an updated &lsquo;Revised&rsquo; date and the updated version will be effective as soon
        as it is accessible. If we make material changes to this privacy notice, we may notify you
        either by prominently posting a notice of such changes or by directly sending you a
        notification. We encourage you to review this privacy notice frequently to be informed of
        how we are protecting your information.
      </p>
    ),
  },
  {
    id: 'section-12',
    n: '12',
    headline: 'How can you contact us about this notice?',
    body: (
      <>
        <p>
          If you have questions or comments about this notice, you may email us at <MailLink /> or
          by post to:
        </p>
        <address className="not-italic mt-2 border border-bronze/30 bg-graphite/40 p-6 lg:p-7 font-[family-name:var(--font-editorial)] text-[15.5px] leading-[1.85] text-ivory">
          The Club by Sarah Restrick
          <br />
          1 Worsley Court High Street
          <br />
          Worsley
          <br />
          Manchester M28 3NJ
          <br />
          United Kingdom
        </address>
      </>
    ),
  },
  {
    id: 'section-13',
    n: '13',
    headline: 'How can you review, update, or delete the data we collect from you?',
    body: (
      <p>
        Based on the applicable laws of your country, you may have the right to request access to
        the personal information we collect from you, change that information, or delete it. To
        request to review, update, or delete your personal information, please email us at{' '}
        <MailLink />.
      </p>
    ),
  },
]

export default async function PrivacyPolicyPage() {
  const hero = await getPageHero('privacy-policy', {
    page_slug: 'privacy-policy',
    media_type: 'image',
    image_url: HERO_IMAGE,
    alt_text: 'A quiet desk with a sealed letter',
    eyebrow: 'The Standard · Privacy',
    headline: 'Privacy Policy.',
    lede: 'How and why we collect, store, use, and share your information.',
  })

  return (
    <>
      {/* ── 01 · Hero ──────────────────────────────────────────────── */}
      <section className="relative h-[78vh] min-h-[560px] w-full overflow-hidden bg-ink">
        <PageHeroMedia
          mediaType={hero.media_type}
          imageUrl={hero.image_url}
          alt={hero.alt_text}
          videoUrl={hero.video_url}
          videoPosterUrl={hero.video_poster_url}
          overlay={0.62}
          priority
        />
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-b from-transparent to-ink pointer-events-none" />
        <div className="relative z-10 h-full max-w-[1400px] mx-auto px-6 lg:px-10 flex flex-col justify-end pb-24">
          {hero.eyebrow && (
            <Reveal type="up" delay={0}>
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-6">
                {hero.eyebrow}
              </p>
            </Reveal>
          )}
          {hero.headline && (
            <Reveal type="clip" delay={150}>
              <h1 className="display-xl max-w-4xl">{hero.headline}</h1>
            </Reveal>
          )}
          {hero.lede && (
            <Reveal type="up" delay={400}>
              <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.125rem,1.4vw,1.5rem)] text-ivory-soft mt-6 max-w-xl">
                {hero.lede}
              </p>
            </Reveal>
          )}
        </div>
      </section>

      {/* ── 02 · Preamble ──────────────────────────────────────────── */}
      <Chapter density="tight" bg="ink" className="!py-16 md:!py-20">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal type="up" delay={0}>
            <span className="block h-px w-12 bg-bronze/55 mx-auto mb-7" />
          </Reveal>
          <Reveal type="up" delay={100}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
              A note on your data
            </p>
          </Reveal>
          <Reveal type="clip" delay={200}>
            <h2 className="display-md">Plainly written. Quietly held.</h2>
          </Reveal>
          <Reveal type="up" delay={400}>
            <p className="mt-6 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.7] text-ivory-soft">
              This privacy notice for The Club by Sarah Restrick (&lsquo;Company&rsquo;,
              &lsquo;we&rsquo;, &lsquo;us&rsquo;, or &lsquo;our&rsquo;) describes how and why we
              might collect, store, use, and/or share (&lsquo;process&rsquo;) your information when
              you use our Services, such as when you visit our website at{' '}
              <Ext href="https://theclubbysarahrestrick.com">
                https://theclubbysarahrestrick.com
              </Ext>{' '}
              or engage with us in other related ways — including any sales, marketing, or events.
            </p>
          </Reveal>
          <Reveal type="up" delay={500}>
            <p className="mt-5 font-[family-name:var(--font-editorial)] text-[clamp(1.0625rem,1.25vw,1.25rem)] leading-[1.7] text-ivory-soft">
              Questions or concerns? Reading this privacy notice will help you understand your
              privacy rights and choices. If you do not agree with our policies and practices,
              please do not use our Services. If you still have any questions or concerns, please
              contact us at <MailLink />.
            </p>
          </Reveal>
          <Reveal type="up" delay={600}>
            <p className="mt-7 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-slate-haze">
              Last updated {LAST_UPDATED}
            </p>
          </Reveal>
        </div>
      </Chapter>

      {/* ── 03 · Summary of Key Points ─────────────────────────────── */}
      <Chapter density="tight" bg="ink" className="!pt-6 md:!pt-10 !pb-16 md:!pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="mb-12">
            <EditorialMeta number="01" label="Summary of Key Points" />
            <Reveal type="clip" delay={150}>
              <h2 className="display-lg mt-7">In short.</h2>
            </Reveal>
            <Reveal type="up" delay={300}>
              <p className="mt-6 body-prose max-w-2xl">
                The headline answers to the questions members ask most. Each one links straight to
                the full section below if you&apos;d like the detail.
              </p>
            </Reveal>
          </div>

          <Reveal type="up" delay={0}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
              {SUMMARY.map((s, i) => (
                <a
                  key={i}
                  href={`#${s.link}`}
                  className="group relative block border border-graphite-line/50 hover:border-bronze/60 bg-graphite/30 hover:bg-bronze/[0.04] p-6 lg:p-7 transition-all duration-500"
                >
                  <p className="font-[family-name:var(--font-display)] text-[clamp(1rem,1.3vw,1.1875rem)] leading-[1.35] text-ivory group-hover:text-bronze-light transition-colors duration-500">
                    {s.q}
                  </p>
                  <p className="mt-4 font-[family-name:var(--font-editorial)] italic text-[14px] leading-[1.65] text-ivory-soft">
                    {s.a}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light/85 group-hover:text-bronze-light transition-colors duration-500">
                    Read the full section
                    <ArrowUpRight
                      size={12}
                      strokeWidth={1.5}
                      className="transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    />
                  </span>
                </a>
              ))}
            </div>
          </Reveal>
        </div>
      </Chapter>

      {/* ── 04 · Table of contents ─────────────────────────────────── */}
      <Chapter density="tight" bg="ink" className="!py-14 md:!py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <Reveal type="up" delay={0}>
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
                Navigate
              </p>
            </Reveal>
            <Reveal type="clip" delay={150}>
              <h2 className="font-[family-name:var(--font-display)] text-[clamp(1.75rem,2.4vw,2.25rem)] text-ivory">
                Table of contents.
              </h2>
            </Reveal>
          </div>

          <Reveal type="up" delay={0}>
            <ol className="border-t border-bronze/20 grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {SECTIONS.map((s) => (
                <li
                  key={s.id}
                  className="border-b border-bronze/15 group"
                >
                  <a
                    href={`#${s.id}`}
                    className="flex items-center gap-5 py-4 group/link"
                  >
                    <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.28em] tabular-nums text-bronze-light/80 group-hover/link:text-bronze-light transition-colors duration-300 w-8 shrink-0">
                      {s.n}
                    </span>
                    <span className="flex-1 font-[family-name:var(--font-editorial)] text-[15px] leading-[1.4] text-ivory-soft group-hover/link:text-ivory transition-colors duration-300">
                      {s.headline}
                    </span>
                    <ArrowUpRight
                      size={13}
                      strokeWidth={1.5}
                      className="text-slate-haze group-hover/link:text-bronze-light transition-all duration-300 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 shrink-0"
                    />
                  </a>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </Chapter>

      {/* ── 05 · The 13 Sections ───────────────────────────────────── */}
      <Chapter density="tight" bg="ink" className="!pt-6 md:!pt-10 !pb-20 md:!pb-24">
        <TracingBeam className="max-w-5xl mx-auto">
          <div className="mb-12">
            <EditorialMeta number="02" label="The Notice" />
            <Reveal type="clip" delay={150}>
              <h2 className="display-lg mt-7">In full.</h2>
            </Reveal>
          </div>

          <ol className="space-y-14 lg:space-y-16">
            {SECTIONS.map((s) => (
              <li
                key={s.id}
                id={s.id}
                // scroll-mt accounts for the sticky header so the
                // heading lands cleanly under it on anchor jump
                className="scroll-mt-24 lg:scroll-mt-28"
              >
                <Reveal type="up" delay={0}>
                  <div className="flex items-center gap-4 mb-6">
                    <span className="font-[family-name:var(--font-meta)] text-[11px] uppercase tracking-[0.32em] text-bronze-light tabular-nums">
                      Section {s.n}
                    </span>
                    <span className="h-px flex-1 bg-bronze/25" />
                    <a
                      href="#top"
                      className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-haze hover:text-bronze-light transition-colors duration-300"
                      aria-label="Back to top"
                    >
                      Top ↑
                    </a>
                  </div>
                </Reveal>

                {/* Two-column editorial spread matching /club-rules */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 md:gap-8 lg:gap-10">
                  <div className="md:col-span-3 lg:col-span-2">
                    <Reveal type="up" delay={100}>
                      <span
                        aria-hidden
                        className="font-[family-name:var(--font-display)] text-[clamp(2.75rem,5vw,4.5rem)] leading-none text-bronze/55 tabular-nums select-none"
                      >
                        {s.n}
                      </span>
                    </Reveal>
                  </div>
                  <div className="md:col-span-9 lg:col-span-10">
                    <Reveal type="clip" delay={200}>
                      <h3 className="font-[family-name:var(--font-display)] text-[clamp(1.5rem,2.2vw,2.125rem)] leading-[1.2] text-ivory">
                        {s.headline}
                      </h3>
                    </Reveal>

                    {s.short && (
                      <Reveal type="up" delay={300}>
                        <div className="mt-5 px-5 py-4 border-l-2 border-bronze/50 bg-bronze/[0.04]">
                          <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light mb-2">
                            In short
                          </p>
                          <p className="font-[family-name:var(--font-editorial)] italic text-[15px] leading-[1.7] text-ivory">
                            {s.short}
                          </p>
                        </div>
                      </Reveal>
                    )}

                    <Reveal type="up" delay={400}>
                      <div className="mt-5 body-prose max-w-prose space-y-4">{s.body}</div>
                    </Reveal>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </TracingBeam>
      </Chapter>

      {/* ── 06 · Closing remarks ───────────────────────────────────── */}
      <Chapter density="tight" bg="ink" className="!py-16 md:!py-20">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal type="up" delay={0}>
            <span className="block h-px w-12 bg-bronze/55 mx-auto mb-7" />
          </Reveal>
          <Reveal type="up" delay={100}>
            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.42em] text-bronze-light mb-5">
              In closing
            </p>
          </Reveal>
          <Reveal type="up" delay={250}>
            <p className="font-[family-name:var(--font-editorial)] italic text-[clamp(1.125rem,1.4vw,1.4375rem)] leading-[1.75] text-ivory-soft">
              For any privacy question, write to <MailLink />. A real person reads it.
            </p>
          </Reveal>
        </div>
      </Chapter>

      {/* ── 07 · Apply close ───────────────────────────────────────── */}
      <ApplyClose />

      {/* Anchor for the "Top ↑" link in each section */}
      <span id="top" className="sr-only" />
    </>
  )
}
