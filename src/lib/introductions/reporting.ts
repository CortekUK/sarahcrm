// Introductions dashboard / reporting aggregation.
//
// Pure, no I/O. Given every introduction row (with the commercial-outcome
// fields) plus a lookup of the members involved, it produces the exact metrics
// the client doc calls for — the "most powerful sales tool":
//
//   Total Introductions Requested, Total Introductions Made, Meetings Created,
//   Opportunities (Deals Won), Revenue Generated, plus ROI by Member and ROI
//   by Industry Sector.
//
// Money is integer pence throughout; the view formats with `formatCurrency`.

// Statuses that mean an introduction was actually MADE (email went out / the
// two members are engaging), in addition to any explicit sent timestamp.
const SENT_STATUSES = new Set(['sent', 'accepted', 'completed'])

export interface ReportIntro {
  member_a_id: string
  member_b_id: string
  requested_by: string | null
  status: string
  sent_at: string | null
  meeting_held_at: string | null
  deal_status: string | null
  revenue_pence: number | null
}

export interface ReportMember {
  id: string
  name: string
  sector: string | null
}

/** One row in a ranked ROI breakdown (by member or by sector). */
export interface RankedRow {
  key: string
  label: string
  revenuePence: number
  introCount: number
}

export interface IntroReport {
  totalIntroductions: number
  totalRequested: number
  totalMade: number
  meetingsHeld: number
  dealsWon: number
  revenuePence: number
  /** Top members by introduction revenue generated. */
  byMember: RankedRow[]
  /** Revenue grouped by the member's industry sector. */
  bySector: RankedRow[]
}

/**
 * Aggregate every introduction into the dashboard metrics + two ROI
 * breakdowns. A member is "in" an introduction as member_a_id OR member_b_id,
 * so each intro's revenue is attributed to BOTH participants (and thus to both
 * of their sectors) — the value flows to everyone the introduction touched.
 */
export function buildIntroReport(
  intros: ReportIntro[],
  members: ReportMember[],
  opts: { topN?: number } = {},
): IntroReport {
  const topN = opts.topN ?? 5
  const memberById = new Map(members.map((m) => [m.id, m]))

  let totalRequested = 0
  let totalMade = 0
  let meetingsHeld = 0
  let dealsWon = 0
  let revenuePence = 0

  const memberAgg = new Map<string, RankedRow>()
  const sectorAgg = new Map<string, RankedRow>()

  const bump = (
    map: Map<string, RankedRow>,
    key: string,
    label: string,
    revenue: number,
  ) => {
    const row = map.get(key) ?? { key, label, revenuePence: 0, introCount: 0 }
    row.revenuePence += revenue
    row.introCount += 1
    map.set(key, row)
  }

  for (const intro of intros) {
    if (intro.requested_by) totalRequested++
    if (intro.sent_at || SENT_STATUSES.has(intro.status)) totalMade++
    if (intro.meeting_held_at) meetingsHeld++
    if (intro.deal_status === 'won') dealsWon++
    const rev = intro.revenue_pence ?? 0
    revenuePence += rev

    for (const id of [intro.member_a_id, intro.member_b_id]) {
      const m = memberById.get(id)
      if (!m) continue
      bump(memberAgg, id, m.name, rev)
      const sector = m.sector?.trim() || 'Unspecified'
      bump(sectorAgg, sector, sector, rev)
    }
  }

  const rank = (map: Map<string, RankedRow>): RankedRow[] =>
    [...map.values()]
      .filter((r) => r.revenuePence > 0)
      .sort((a, b) => b.revenuePence - a.revenuePence)
      .slice(0, topN)

  return {
    totalIntroductions: intros.length,
    totalRequested,
    totalMade,
    meetingsHeld,
    dealsWon,
    revenuePence,
    byMember: rank(memberAgg),
    bySector: rank(sectorAgg),
  }
}
