import type { Database } from '@/types/database'

type IntroUpdate = Database['public']['Tables']['introductions']['Update']

// Shared logic for Introduction Outcome Tracking (Phase 2 · Feature #2).
//
// The commercial pipeline hangs off the introductions row:
//   Introduced → Meeting held → Proposal sent → Deal won/lost
//   → Revenue generated → Testimonial
//
// Two admin surfaces record outcomes (IntroductionDetailPage and the
// MemberMatchesPanel modal). To keep them from drifting, both build their
// DB update through `buildIntroOutcomeUpdate` here.

export type DealStatus = 'won' | 'lost'

/** The raw outcome fields as edited in the UI. */
export interface IntroOutcomeValues {
  outcome: string | null
  meeting_held_at: string | null
  proposal_sent_at: string | null
  deal_status: DealStatus | null
  estimated_value_pence: number | null
  revenue_pence: number | null
  testimonial_obtained: boolean
  testimonial_note: string | null
}

/** The pipeline stages, in order, for display/derivation. */
export const OUTCOME_STAGES = [
  'introduced',
  'meeting',
  'proposal',
  'deal',
  'revenue',
  'testimonial',
] as const
export type OutcomeStage = (typeof OUTCOME_STAGES)[number]

/**
 * The furthest pipeline stage a set of outcome values has reached.
 * Used to render the progress tracker.
 */
export function outcomeStage(v: {
  meeting_held_at: string | null
  proposal_sent_at: string | null
  deal_status: DealStatus | null
  revenue_pence: number | null
  testimonial_obtained: boolean
}): OutcomeStage {
  if (v.testimonial_obtained) return 'testimonial'
  if (v.revenue_pence != null && v.revenue_pence > 0) return 'revenue'
  if (v.deal_status != null) return 'deal'
  if (v.proposal_sent_at) return 'proposal'
  if (v.meeting_held_at) return 'meeting'
  return 'introduced'
}

/**
 * INDEPENDENT milestone flags for the pipeline tracker. Each stage reflects
 * its OWN checkbox/value — not a single "furthest reached" cursor — so a deal
 * can be Won without a formal Proposal, and unticking Meeting doesn't affect
 * Deal. "Introduced" is always true (the introduction exists).
 */
export function outcomeStageFlags(v: {
  meeting_held_at: string | null
  proposal_sent_at: string | null
  deal_status: DealStatus | null
  revenue_pence: number | null
  testimonial_obtained: boolean
}): Record<OutcomeStage, boolean> {
  return {
    introduced: true,
    meeting: Boolean(v.meeting_held_at),
    proposal: Boolean(v.proposal_sent_at),
    deal: v.deal_status != null,
    revenue: v.revenue_pence != null && v.revenue_pence > 0,
    testimonial: v.testimonial_obtained,
  }
}

/**
 * Build the introductions update payload from edited outcome values.
 *
 * Completion semantics (preserved from the legacy flat flow): the intro is
 * marked `completed` and stamped with a completion time ONCE A DEAL IS
 * DECIDED (won or lost). Recording only a meeting or proposal keeps the
 * intro in its current status — it's still in progress. `business_converted`
 * is kept in sync with `deal_status === 'won'` so anything still reading the
 * legacy flag stays correct.
 *
 * @param existingFollowedUpAt current followed_up_at, so we don't overwrite
 *        an already-recorded completion time.
 */
export function buildIntroOutcomeUpdate(
  v: IntroOutcomeValues,
  existingFollowedUpAt: string | null,
  now: string = new Date().toISOString(),
): IntroUpdate {
  const dealDecided = v.deal_status != null

  const update: IntroUpdate = {
    outcome: v.outcome?.trim() || null,
    meeting_held_at: v.meeting_held_at,
    proposal_sent_at: v.proposal_sent_at,
    deal_status: v.deal_status,
    deal_closed_at: dealDecided ? (existingFollowedUpAt ?? now) : null,
    estimated_value_pence: v.estimated_value_pence,
    // Realised revenue only makes sense on a won deal.
    revenue_pence: v.deal_status === 'won' ? v.revenue_pence : null,
    testimonial_obtained: v.testimonial_obtained,
    testimonial_note: v.testimonial_obtained ? v.testimonial_note?.trim() || null : null,
    // keep the legacy flag in lock-step
    business_converted: v.deal_status === 'won',
  }

  if (dealDecided) {
    update.status = 'completed'
    update.followed_up_at = existingFollowedUpAt ?? now
  }

  return update
}

/** Parse a pounds string ("1,250.50") into integer pence, or null. */
export function poundsToPence(input: string): number | null {
  const cleaned = input.replace(/[,\s£]/g, '')
  if (!cleaned) return null
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** Pence → a plain pounds string for an <input>, or '' when null. */
export function penceToPounds(pence: number | null): string {
  return pence != null ? String(pence / 100) : ''
}

/** A timestamptz → 'YYYY-MM-DD' for a date <input>, or '' when null. */
export function toDateInput(ts: string | null): string {
  return ts ? ts.slice(0, 10) : ''
}

/** A 'YYYY-MM-DD' date input → ISO timestamp, or null when blank. */
export function fromDateInput(date: string): string | null {
  if (!date) return null
  // Interpret the picked calendar day at UTC midnight — stable and
  // avoids Date.now()-style drift; only the date portion is ever shown.
  return new Date(`${date}T00:00:00.000Z`).toISOString()
}
