'use client'

import Image from 'next/image'

// Digital membership card — a premium "black card" for the member
// portal. Bronze foil accents on ink, hairline border, corner brackets
// echoing the editorial cards elsewhere in the portal. Shows the
// member's name, tier and member number in the loyalty-card idiom
// ("MEMBER No. 1042").

const TIER_LABELS: Record<string, string> = {
  tier_1: 'Access',
  tier_2: 'The Club Membership',
  tier_3: 'The Club Business Membership',
}

interface DigitalCardProps {
  name: string
  /** Tier key (tier_1…) or an already-resolved plan name. */
  tier: string | null
  memberNumber: number | null
  /** e.g. "Renews 12 Mar 2027" — shown under the number when set. */
  validityLabel?: string | null
  /** Data-URL QR for verification at events and partners (optional). */
  qrDataUrl?: string | null
}

export function DigitalCard({ name, tier, memberNumber, validityLabel, qrDataUrl }: DigitalCardProps) {
  const tierLabel = tier ? TIER_LABELS[tier] ?? tier : null
  const formattedNumber =
    memberNumber != null ? String(memberNumber).padStart(4, '0') : '—'

  return (
    <div className="relative w-full max-w-md aspect-[1.586/1] rounded-2xl overflow-hidden border border-bronze/40 bg-gradient-to-br from-graphite-2 via-ink to-black shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]">
      {/* Soft bronze glow in the corner */}
      <div
        aria-hidden
        className="absolute -top-1/3 -right-1/4 w-2/3 h-2/3 rounded-full bg-bronze/15 blur-3xl pointer-events-none"
      />
      {/* Subtle guilloché-style hairlines */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06] pointer-events-none"
        style={{
          backgroundImage:
            'repeating-linear-gradient(115deg, transparent 0 22px, rgba(196,154,90,0.9) 22px 23px)',
        }}
      />

      {/* Corner brackets */}
      <span aria-hidden className="absolute top-4 left-4 w-5 h-px bg-bronze/60 pointer-events-none" />
      <span aria-hidden className="absolute top-4 left-4 w-px h-5 bg-bronze/60 pointer-events-none" />
      <span aria-hidden className="absolute bottom-4 right-4 w-5 h-px bg-bronze/60 pointer-events-none" />
      <span aria-hidden className="absolute bottom-4 right-4 w-px h-5 bg-bronze/60 pointer-events-none" />

      <div className="relative h-full flex flex-col justify-between p-6 sm:p-7">
        {/* Top row — wordmark + tier */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Image
              src="/logo-white.png"
              alt=""
              width={32}
              height={32}
              className="h-8 w-8 opacity-90"
            />
            <div className="leading-none">
              <p className="font-[family-name:var(--font-display)] text-[16px] tracking-[0.02em] text-ivory">
                The Club
              </p>
              <p className="font-[family-name:var(--font-meta)] text-[8px] font-medium uppercase tracking-[0.32em] text-bronze-light mt-1">
                Members Card
              </p>
            </div>
          </div>
          {tierLabel && (
            <span className="inline-flex items-center rounded-full border border-bronze/50 bg-bronze/10 px-3 py-1 font-[family-name:var(--font-meta)] text-[9px] font-medium uppercase tracking-[0.22em] text-bronze-light text-right leading-[1.4] max-w-[60%]">
              {tierLabel}
            </span>
          )}
        </div>

        {/* Bottom — name + number (+ QR) */}
        <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-meta)] text-[8.5px] uppercase tracking-[0.34em] text-slate-haze mb-1.5">
            Member No.
          </p>
          <p className="font-[family-name:var(--font-display)] text-[26px] sm:text-[30px] leading-none tracking-[0.12em] text-bronze-light tabular-nums mb-4">
            {formattedNumber}
          </p>
          <p className="font-[family-name:var(--font-meta)] text-[12px] font-medium uppercase tracking-[0.28em] text-ivory truncate">
            {name || 'Member'}
          </p>
          {validityLabel && (
            <p className="mt-1.5 font-[family-name:var(--font-meta)] text-[8.5px] uppercase tracking-[0.3em] text-slate-haze">
              {validityLabel}
            </p>
          )}
        </div>
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qrDataUrl}
            alt="Membership verification QR code"
            className="h-[72px] w-[72px] sm:h-[84px] sm:w-[84px] shrink-0 rounded-md bg-white p-1"
          />
        )}
        </div>
      </div>
    </div>
  )
}
