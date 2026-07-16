// Lead scoring (Feature #1 — enquiry routing)
//
// Deterministic, transparent, cheap-to-compute score for an inbound website
// enquiry. Every score is an integer 0–100. The formulas are intentionally
// simple and fully commented so they can be sanity-checked and tuned by hand
// — no ML, no hidden state, NO side effects, NO database. Mirrors the style
// of src/lib/members/scoring.ts.
//
// A higher score = a hotter lead (more complete contact detail, higher-intent
// subject, buying-signal keywords, a corporate email domain). The `reasons`
// array is the plain-English breakdown the admin view surfaces so the number
// is always explainable.

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)))

// Free / consumer mailbox providers. A corporate (non-free) domain is a
// mild buying signal — it suggests the enquirer is writing from a business.
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'yahoo.co.uk',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
])

// Buying-signal keywords. Their presence in the message body suggests a
// commercially serious enquiry (budget, investment, sponsorship intent, …).
const SIGNAL_KEYWORDS = [
  'turnover',
  'invest',
  'sponsor',
  'budget',
  'acquisition',
]

// Intent weight — the subject the enquirer picked. Membership and sponsorship
// are the highest-value pipelines; event/concierge/venue are mid; a general
// enquiry is the lowest signal. We read the FIRST intent only.
const INTENT_WEIGHT: Record<string, number> = {
  membership: 25,
  sponsorship: 25,
  event: 15,
  private_event: 15,
  concierge: 15,
  venue: 15,
  press: 5,
  general: 5,
}

// The shape the scorer needs — a loose subset of an enquiry row so it can be
// scored before OR after the row is persisted (the intake route scores the
// payload it is about to insert).
export interface ScorableEnquiry {
  email?: string | null
  phone?: string | null
  company?: string | null
  intent?: string[] | null
  message?: string | null
}

export interface LeadScore {
  score: number
  reasons: string[]
}

function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null
  const at = email.lastIndexOf('@')
  if (at === -1) return null
  return email.slice(at + 1).trim().toLowerCase() || null
}

// ── scoreEnquiry — pure deterministic 0–100 lead score ──────────────
export function scoreEnquiry(enquiry: ScorableEnquiry): LeadScore {
  const reasons: string[] = []
  let score = 0

  // Everyone starts at a small baseline so a bare-but-valid enquiry isn't 0.
  //   baseline → 10
  score += 10

  // ── Contact completeness ──────────────────────────────────────
  //   has company → +12   (a named business = a qualifiable lead)
  //   has phone   → +8    (willing to be called = warmer)
  if (enquiry.company && enquiry.company.trim()) {
    score += 12
    reasons.push('Company provided')
  }
  if (enquiry.phone && enquiry.phone.trim()) {
    score += 8
    reasons.push('Phone number provided')
  }

  // ── Intent weight (first intent only) ─────────────────────────
  //   membership/sponsorship → +25 · event/concierge/venue → +15
  //   press → +5 · general → +5 · unknown → +8
  const firstIntent = enquiry.intent?.[0]
  if (firstIntent) {
    const weight = INTENT_WEIGHT[firstIntent] ?? 8
    score += weight
    const label =
      weight >= 25 ? 'High-value' : weight >= 15 ? 'Mid-value' : 'Low-value'
    reasons.push(`${label} intent: ${firstIntent}`)
  }

  // ── Message depth ─────────────────────────────────────────────
  // A longer note signals genuine effort/interest.
  //   ≥ 400 chars → +12 · ≥ 200 chars → +8 · ≥ 80 chars → +4 · else 0
  const messageLen = (enquiry.message ?? '').trim().length
  if (messageLen >= 400) {
    score += 12
    reasons.push('Detailed message (400+ chars)')
  } else if (messageLen >= 200) {
    score += 8
    reasons.push('Substantial message (200+ chars)')
  } else if (messageLen >= 80) {
    score += 4
    reasons.push('Moderate message length')
  }

  // ── Buying-signal keywords ────────────────────────────────────
  //   +6 per distinct keyword hit, capped at +18 (3 hits)
  const haystack = (enquiry.message ?? '').toLowerCase()
  const hits = SIGNAL_KEYWORDS.filter((kw) => haystack.includes(kw))
  if (hits.length > 0) {
    score += Math.min(18, hits.length * 6)
    reasons.push(`Buying-signal keywords: ${hits.join(', ')}`)
  }

  // ── Email domain quality ──────────────────────────────────────
  //   corporate (non-free) domain → +10 · free/consumer domain → +0
  const domain = emailDomain(enquiry.email)
  if (domain) {
    if (FREE_EMAIL_DOMAINS.has(domain)) {
      reasons.push('Free / consumer email domain')
    } else {
      score += 10
      reasons.push(`Corporate email domain (${domain})`)
    }
  }

  const final = clamp(score)
  if (reasons.length === 0) reasons.push('No strong signals')
  return { score: final, reasons }
}
