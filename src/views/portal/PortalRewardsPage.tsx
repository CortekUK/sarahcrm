'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  ArrowUpRight,
  BadgeCheck,
  Check,
  Gift,
  Sparkles,
  Ticket,
} from 'lucide-react'
import {
  PortalBadge,
  PortalButton,
  PortalCard,
  PortalEmptyState,
  PortalLoading,
  PortalPageHeader,
  PortalSectionTitle,
  type PortalBadgeVariant,
} from '@/components/portal/PortalChrome'
import { DigitalCard } from '@/components/portal/DigitalCard'

// ── Row shapes (member-safe reads via the browser client) ────────────
interface Partner {
  id: string
  name: string
  category: string
  description: string | null
  website_url: string | null
  display_order: number
}

interface Offer {
  id: string
  partner_id: string
  title: string
  summary: string | null
  details: string | null
  member_benefit: string | null
  redemption_process: string | null
  booking_url: string | null
  discount_code: string | null
  valid_until: string | null
  display_order: number
}

interface Claim {
  id: string
  offer_id: string
  status: string
  claimed_at: string
  value_pence: number | null
}

interface MemberRow {
  id: string
  member_number: number | null
  membership_tier: string | null
  profiles: { first_name: string | null; last_name: string | null } | null
}

const CLAIM_STATUS_META: Record<string, { label: string; variant: PortalBadgeVariant }> = {
  claimed: { label: 'Claimed', variant: 'upcoming' },
  redeemed: { label: 'Redeemed', variant: 'active' },
  cancelled: { label: 'Cancelled', variant: 'urgent' },
}

export function PortalRewardsPage() {
  const { user } = useAuth()
  const [member, setMember] = useState<MemberRow | null>(null)
  const [partners, setPartners] = useState<Partner[]>([])
  const [offers, setOffers] = useState<Offer[]>([])
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user?.id) init(user.id)
  }, [user?.id])

  async function init(userId: string) {
    setLoading(true)
    const { data: me } = await supabase
      .from('members')
      .select('id, member_number, membership_tier, profiles(first_name, last_name)')
      .eq('profile_id', userId)
      .maybeSingle()

    if (me) {
      setMember(me as unknown as MemberRow)

      const [partnersRes, offersRes] = await Promise.all([
        supabase
          .from('reward_partners')
          .select('id, name, category, description, website_url, display_order')
          .eq('is_active', true)
          .order('display_order'),
        supabase
          .from('reward_offers')
          .select(
            'id, partner_id, title, summary, details, member_benefit, redemption_process, booking_url, discount_code, valid_until, display_order',
          )
          .eq('is_active', true)
          .order('display_order'),
      ])

      if (partnersRes.data) setPartners(partnersRes.data as unknown as Partner[])
      if (offersRes.data) setOffers(offersRes.data as unknown as Offer[])
      await loadClaims(me.id)
    }
    setLoading(false)
  }

  async function loadClaims(memberId: string) {
    const { data } = await supabase
      .from('reward_claims')
      .select('id, offer_id, status, claimed_at, value_pence')
      .eq('member_id', memberId)
      .order('claimed_at', { ascending: false })
    if (data) setClaims(data as unknown as Claim[])
  }

  async function handleClaim(offerId: string) {
    if (!member) return
    setClaimingId(offerId)
    setError(null)
    const { error: insertError } = await supabase.from('reward_claims').insert({
      member_id: member.id,
      offer_id: offerId,
      status: 'claimed',
    })
    setClaimingId(null)
    if (insertError) {
      setError('We could not claim this offer. Please try again.')
      return
    }
    await loadClaims(member.id)
  }

  // offer_id -> the member's active (non-cancelled) claim, if any
  const claimByOffer = useMemo(() => {
    const map = new Map<string, Claim>()
    for (const c of claims) {
      if (c.status === 'cancelled') continue
      if (!map.has(c.offer_id)) map.set(c.offer_id, c)
    }
    return map
  }, [claims])

  const partnerById = useMemo(() => {
    const map = new Map<string, Partner>()
    for (const p of partners) map.set(p.id, p)
    return map
  }, [partners])

  // Group partners (with their active offers) by category. Only include
  // partners that actually have live offers to show.
  const grouped = useMemo(() => {
    const offersByPartner = new Map<string, Offer[]>()
    for (const o of offers) {
      const list = offersByPartner.get(o.partner_id) ?? []
      list.push(o)
      offersByPartner.set(o.partner_id, list)
    }
    const byCategory = new Map<string, { partner: Partner; offers: Offer[] }[]>()
    for (const p of partners) {
      const pOffers = offersByPartner.get(p.id)
      if (!pOffers || pOffers.length === 0) continue
      const list = byCategory.get(p.category) ?? []
      list.push({ partner: p, offers: pOffers })
      byCategory.set(p.category, list)
    }
    return Array.from(byCategory.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [partners, offers])

  if (loading) {
    return (
      <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-12">
        <PortalLoading label="Loading your benefits" />
      </div>
    )
  }

  const name = `${member?.profiles?.first_name ?? ''} ${member?.profiles?.last_name ?? ''}`.trim()

  return (
    <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
      <PortalPageHeader
        eyebrow="Rewards & Benefits"
        title="Your privileges."
        subtitle="A curated collection of partner offers, member rates and access — reserved for The Club. Present your card, claim an offer, and enjoy."
      />

      {/* Digital membership card */}
      <div className="mb-12 lg:mb-14 flex justify-center sm:justify-start">
        <DigitalCard
          name={name}
          tier={member?.membership_tier ?? null}
          memberNumber={member?.member_number ?? null}
        />
      </div>

      {/* Browse offers */}
      <PortalSectionTitle eyebrow="Browse">Partner offers.</PortalSectionTitle>
      {grouped.length === 0 ? (
        <PortalEmptyState
          icon={<Gift size={18} strokeWidth={1.5} />}
          title="No offers just yet"
          description="New partner benefits are added regularly. Check back soon — there's more to come."
        />
      ) : (
        <div className="space-y-12">
          {grouped.map(([category, entries]) => (
            <div key={category}>
              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.32em] text-bronze-light/85 mb-5">
                {category}
              </p>
              <div className="space-y-5">
                {entries.map(({ partner, offers: pOffers }) =>
                  pOffers.map((offer) => {
                    const claim = claimByOffer.get(offer.id)
                    const claimed = !!claim
                    const bookHref = offer.booking_url || partner.website_url
                    return (
                      <PortalCard key={offer.id} className="p-6 lg:p-7">
                        {/* Partner + status */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-haze mb-1.5">
                              {partner.name}
                            </p>
                            <p className="font-[family-name:var(--font-display)] text-[19px] text-ivory leading-tight">
                              {offer.title}
                            </p>
                          </div>
                          {claimed && (
                            <PortalBadge
                              variant={CLAIM_STATUS_META[claim.status]?.variant ?? 'upcoming'}
                              dot
                            >
                              {CLAIM_STATUS_META[claim.status]?.label ?? claim.status}
                            </PortalBadge>
                          )}
                        </div>

                        {/* Member benefit — the headline value */}
                        {offer.member_benefit && (
                          <p className="mt-3 inline-flex items-center gap-2 font-[family-name:var(--font-editorial)] italic text-[15px] text-bronze-light leading-[1.6]">
                            <Sparkles size={14} strokeWidth={1.5} className="shrink-0" />
                            {offer.member_benefit}
                          </p>
                        )}

                        {/* Full details — authenticated members see everything */}
                        {(offer.summary || offer.details) && (
                          <p className="mt-3 font-[family-name:var(--font-editorial)] text-[13.5px] text-ivory-soft/85 leading-[1.7]">
                            {offer.details || offer.summary}
                          </p>
                        )}

                        {offer.redemption_process && (
                          <div className="mt-4">
                            <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.28em] text-slate-haze mb-1.5">
                              How to redeem
                            </p>
                            <p className="font-[family-name:var(--font-editorial)] text-[13px] text-ivory-soft/80 leading-[1.65]">
                              {offer.redemption_process}
                            </p>
                          </div>
                        )}

                        {/* Discount code — revealed prominently once claimed */}
                        {offer.discount_code && (
                          <div className="mt-4">
                            {claimed ? (
                              <div className="inline-flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-bronze/45 bg-bronze/10 px-4 py-2.5">
                                <span className="shrink-0 font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.28em] text-slate-haze">
                                  Your code
                                </span>
                                <span className="min-w-0 break-all font-[family-name:var(--font-display)] text-[16px] tracking-[0.14em] text-bronze-light tabular-nums">
                                  {offer.discount_code}
                                </span>
                              </div>
                            ) : (
                              <p className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] text-slate-dim italic">
                                Claim to reveal your code
                              </p>
                            )}
                          </div>
                        )}

                        {/* Footer — validity + actions */}
                        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
                          <div className="font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] text-slate-dim">
                            {offer.valid_until && <span>Valid until {formatDate(offer.valid_until)}</span>}
                          </div>
                          <div className="flex items-center gap-3">
                            {bookHref && (
                              <a
                                href={bookHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-full border border-graphite-line/70 px-5 py-2.5 font-[family-name:var(--font-meta)] text-[10px] font-medium uppercase tracking-[0.28em] text-ivory/85 hover:border-bronze/55 hover:text-bronze-light hover:bg-bronze/[0.05] transition-all duration-300"
                              >
                                Book / Visit
                                <ArrowUpRight size={13} strokeWidth={1.5} />
                              </a>
                            )}
                            {claimed ? (
                              <span className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-emerald-300">
                                <Check size={13} strokeWidth={2} />
                                Claimed
                              </span>
                            ) : (
                              <PortalButton
                                icon={<Ticket size={13} strokeWidth={1.5} />}
                                loading={claimingId === offer.id}
                                onClick={() => handleClaim(offer.id)}
                              >
                                Claim this offer
                              </PortalButton>
                            )}
                          </div>
                        </div>
                      </PortalCard>
                    )
                  }),
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-6 text-[12.5px] text-rose-300 italic">{error}</p>}

      {/* Usage history */}
      <div className="mt-14 lg:mt-16">
        <PortalSectionTitle eyebrow="Your history">What you've claimed.</PortalSectionTitle>
        {claims.length === 0 ? (
          <PortalEmptyState
            icon={<BadgeCheck size={18} strokeWidth={1.5} />}
            title="Nothing claimed yet"
            description="When you claim an offer, it'll appear here so you can keep track of your benefits."
          />
        ) : (
          <div className="space-y-4">
            {claims.map((c) => {
              const offer = offers.find((o) => o.id === c.offer_id)
              const partner = offer ? partnerById.get(offer.partner_id) : undefined
              const meta = CLAIM_STATUS_META[c.status] ?? { label: c.status, variant: 'neutral' as const }
              return (
                <PortalCard key={c.id} className="p-5 lg:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-[family-name:var(--font-display)] text-[16px] text-ivory leading-tight">
                        {offer?.title ?? 'Offer'}
                      </p>
                      {partner && (
                        <p className="mt-1 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.24em] text-slate-haze">
                          {partner.name}
                        </p>
                      )}
                    </div>
                    <PortalBadge variant={meta.variant} dot>
                      {meta.label}
                    </PortalBadge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.2em] text-slate-dim">
                    <span>Claimed {formatDate(c.claimed_at)}</span>
                    {c.value_pence != null && (
                      <span className="text-bronze-light">Value {formatCurrency(c.value_pence)}</span>
                    )}
                  </div>
                </PortalCard>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
