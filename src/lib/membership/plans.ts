// Canonical plan ↔ tier ↔ membership_type mapping.
//
// THE MODEL: there are exactly three membership PLANS, and each plan IS a
// tier. There is no sub-level of tier within a plan. The plan a member is
// on is identified by `membership_tier` (the single source of truth);
// `membership_type` is fully *derived* from the tier and must never be
// edited independently of it.
//
//   Plan        slug         tier      membership_type   default intro quota
//   ─────────── ──────────── ───────── ───────────────── ───────────────────
//   Individual  individual   tier_1    individual        3
//   Business    business     tier_2    business          5
//   Corporate   corporate    tier_3    business          10
//
// "Corporate" is the public name for the top tier; it shares the
// `business` membership_type (same payee model, larger seat count +
// sponsorship slot). The live, editable intro quota lives on
// `membership_plans.intro_quota` — the defaults below are only a fallback
// for when no matching plan row exists.
//
// Every place that assigns a member's tier/type/quota (application
// approval, manual add, CSV import, the member detail editor, the
// subscription-checkout edge function) resolves through this module so the
// two columns can never drift apart again.

import type { SupabaseClient } from '@supabase/supabase-js'

export type MemberTier = 'tier_1' | 'tier_2' | 'tier_3'
export type MembershipType = 'individual' | 'business'
export type PlanSlug = 'individual' | 'business' | 'corporate'

export interface PlanDef {
  slug: PlanSlug
  tier: MemberTier
  /** Public-facing plan name. */
  name: string
  /** Derived membership_type for this plan. */
  membershipType: MembershipType
  /** Fallback monthly introduction quota (live value is on membership_plans.intro_quota). */
  defaultIntroQuota: number
}

export const PLANS: readonly PlanDef[] = [
  { slug: 'individual', tier: 'tier_1', name: 'Individual', membershipType: 'individual', defaultIntroQuota: 3 },
  { slug: 'business', tier: 'tier_2', name: 'Business', membershipType: 'business', defaultIntroQuota: 5 },
  { slug: 'corporate', tier: 'tier_3', name: 'Corporate', membershipType: 'business', defaultIntroQuota: 10 },
] as const

const BY_TIER = Object.fromEntries(PLANS.map((p) => [p.tier, p])) as Record<MemberTier, PlanDef>
const BY_SLUG = Object.fromEntries(PLANS.map((p) => [p.slug, p])) as Record<PlanSlug, PlanDef>

/** The plan for a tier. Tiers are exhaustive, so this always resolves. */
export function planForTier(tier: MemberTier): PlanDef {
  return BY_TIER[tier] ?? BY_TIER.tier_1
}

export function planForSlug(slug: string | null | undefined): PlanDef | undefined {
  return slug ? BY_SLUG[slug as PlanSlug] : undefined
}

/** membership_type is always derived from the tier — never stored independently. */
export function membershipTypeForTier(tier: MemberTier): MembershipType {
  return planForTier(tier).membershipType
}

// Resolve a free-text plan/tier value (whatever an application form or CSV
// submitted — 'individual', 'corporate', 'tier_2', plus legacy aliases) to
// a canonical plan. Returns the full plan so callers get tier + type + name
// together and can't mismatch them.
export function resolvePlan(input: string | null | undefined): PlanDef {
  const v = (input ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (
    v.includes('tier3') ||
    v.includes('three') ||
    v.includes('platinum') ||
    v.includes('corporate')
  )
    return BY_TIER.tier_3
  if (
    v.includes('tier2') ||
    v.includes('two') ||
    v.includes('gold') ||
    v.includes('business')
  )
    return BY_TIER.tier_2
  return BY_TIER.tier_1
}

// DB-aware resolution. An admin can publish a plan in `membership_plans`
// with a custom slug and assign it one of the three tiers via
// `tier_classification`. The pure `resolvePlan` above only knows the three
// canonical slugs, so an unrecognised slug would collapse to tier_1 — which
// means a custom plan could be sold at its real price yet provisioned as
// Individual. This consults the live plan row first and honours its tier,
// falling back to the fuzzy resolver when there's no matching plan.
export async function resolvePlanFromDb(
  db: SupabaseClient,
  input: string | null | undefined,
): Promise<PlanDef> {
  const slug = (input ?? '').trim()
  if (slug) {
    const { data } = await db
      .from('membership_plans')
      .select('tier_classification')
      .eq('slug', slug)
      .maybeSingle()
    const tc = (data as { tier_classification?: string | null } | null)?.tier_classification
    if (tc === 'tier_1' || tc === 'tier_2' || tc === 'tier_3') {
      return planForTier(tc)
    }
  }
  return resolvePlan(input)
}

/** Options for a single "Plan" <Select> — value is the tier (the source of truth). */
export const PLAN_OPTIONS = PLANS.map((p) => ({ value: p.tier, label: p.name }))

// Live monthly intro quota for a tier, read from the editable
// membership_plans row, falling back to the canonical default. Pass any
// Supabase client (server service-role or browser).
export async function introQuotaForTier(
  db: SupabaseClient,
  tier: MemberTier,
): Promise<number> {
  const { data } = await db
    .from('membership_plans')
    .select('intro_quota')
    .eq('tier_classification', tier)
    .order('display_order', { ascending: true })
    .limit(1)
    .maybeSingle()
  const q = (data as { intro_quota?: number | null } | null)?.intro_quota
  return typeof q === 'number' ? q : planForTier(tier).defaultIntroQuota
}
