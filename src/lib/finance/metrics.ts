// Finance metrics (Feature #2 · Finance dashboards)
//
// Pure, dependency-free helpers so the FinancePage loader (and any
// server route) can compute the same numbers from already-fetched
// rows. All money is integer `*_pence`; we never divide here.

// ── Renewal rate ────────────────────────────────────────────────
//
// "Of the memberships that came up for renewal in a trailing window,
// what share actually renewed?"
//
//   due      = active-tracked members whose `renewal_date` fell inside
//              [today − windowDays, today]  (i.e. it has come up)
//   renewed  = those still `membership_status = 'active'` AND with at
//              least one PAID payment dated after their renewal_date
//              (the recurring charge that carried them past renewal)
//   rate     = renewed / due   (0 when due = 0)
//
// Mirrors DashboardPage's `renewal_date` string-compare window logic
// (YYYY-MM-DD) and billing/renewal.ts semantics (renewal_date is the
// authoritative next-charge date Stripe writes back).

export interface RenewalRateMember {
  id: string
  renewal_date: string | null
  membership_status: string
}

export interface RenewalRatePayment {
  member_id: string | null
  status: string
  paid_at: string | null
}

export interface RenewalRateResult {
  windowDays: number
  due: number
  renewed: number
  rate: number // 0..1
}

export function computeRenewalRate(
  members: RenewalRateMember[],
  payments: RenewalRatePayment[],
  windowDays = 90,
  now: Date = new Date(),
): RenewalRateResult {
  const todayStr = now.toISOString().slice(0, 10)
  const windowStartStr = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - windowDays,
  )
    .toISOString()
    .slice(0, 10)

  // Index paid payments per member for the "renewed after renewal_date" test.
  const paidByMember = new Map<string, string[]>()
  for (const p of payments) {
    if (p.status !== 'paid' || !p.member_id || !p.paid_at) continue
    const list = paidByMember.get(p.member_id) ?? []
    list.push(p.paid_at.slice(0, 10))
    paidByMember.set(p.member_id, list)
  }

  let due = 0
  let renewed = 0
  for (const m of members) {
    if (!m.renewal_date) continue
    const rd = m.renewal_date.slice(0, 10)
    // renewal came up inside the trailing window
    if (rd < windowStartStr || rd > todayStr) continue
    due += 1
    const stillActive = m.membership_status === 'active'
    const paidAfter = (paidByMember.get(m.id) ?? []).some((d) => d > rd)
    if (stillActive && paidAfter) renewed += 1
  }

  return {
    windowDays,
    due,
    renewed,
    rate: due > 0 ? renewed / due : 0,
  }
}

// ── Monthly cashflow ────────────────────────────────────────────
//
// Buckets cash IN (paid payments, by paid_at) and cash OUT (event
// expenses, by created_at) into the last `months` calendar months.
// net = inPence − outPence per bucket.

export interface CashflowInflow {
  amount_pence: number | null
  paid_at: string | null
}

export interface CashflowOutflow {
  amount_pence: number | null
  created_at: string | null
}

export interface CashflowBucket {
  key: string // YYYY-MM
  label: string // "Aug"
  inPence: number
  outPence: number
  netPence: number
}

export function computeCashflow(
  inflows: CashflowInflow[],
  outflows: CashflowOutflow[],
  months = 12,
  now: Date = new Date(),
): CashflowBucket[] {
  const buckets: CashflowBucket[] = []
  const index = new Map<string, CashflowBucket>()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const bucket: CashflowBucket = {
      key,
      label: d.toLocaleDateString('en-GB', { month: 'short' }),
      inPence: 0,
      outPence: 0,
      netPence: 0,
    }
    buckets.push(bucket)
    index.set(key, bucket)
  }

  const bucketKey = (iso: string) => iso.slice(0, 7) // YYYY-MM

  for (const p of inflows) {
    if (!p.paid_at) continue
    const b = index.get(bucketKey(p.paid_at))
    if (b) b.inPence += p.amount_pence ?? 0
  }
  for (const e of outflows) {
    if (!e.created_at) continue
    const b = index.get(bucketKey(e.created_at))
    if (b) b.outPence += e.amount_pence ?? 0
  }
  for (const b of buckets) b.netPence = b.inPence - b.outPence

  return buckets
}
