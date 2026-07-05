// Tag-based introduction matching — the deterministic scoring engine.
//
// Pure functions, no I/O, so they can run anywhere (member-detail panel,
// tests, a server route). Scoring mirrors the original Suggest-Matches modal:
//
//   score = needToIndustry × 3   (one member's "looking for X" meets the
//                                  other's industry X — strongest signal)
//         + sharedIndustry  × 1   (both in the same industry)
//         + sharedInterest  × 0.5 (shared personal interest)
//
// Scores are normalised so the strongest match in a set = 1.0 (100%).

export interface MemberTag {
  tagId: string
  name: string
  category: string
}

export interface MatchCandidate {
  id: string
  name: string
  company: string | null
  email: string | null
  tags: MemberTag[]
  // Richer profile signals (OPTIONAL — the live member panel doesn't supply
  // them, and `scoreMatches` ignores them; only the suggestions engine's
  // `scorePairForSuggestion` reads them). All are free-text member fields.
  sector?: string | null
  subSector?: string | null
  introTargetTypes?: string | null
  introTargetCriteria?: string | null
  whatTheyCanOffer?: string | null
}

export interface MatchResult {
  member: MatchCandidate
  score: number
  sharedTags: string[]
  matchReason: string
}

export function scoreMatches(
  targetId: string,
  targetName: string,
  candidates: MatchCandidate[],
  excludeIds: Set<string>,
): MatchResult[] {
  const target = candidates.find((c) => c.id === targetId)
  if (!target || target.tags.length === 0) return []

  const targetIndustry = target.tags.filter((t) => t.category === 'industry')
  const targetInterest = target.tags.filter((t) => t.category === 'interest')
  const targetNeed = target.tags.filter((t) => t.category === 'need')
  const targetIndustryIds = new Set(targetIndustry.map((t) => t.tagId))
  const targetInterestIds = new Set(targetInterest.map((t) => t.tagId))

  const scored: MatchResult[] = []
  let maxRaw = 0

  for (const member of candidates) {
    if (member.id === targetId) continue
    if (excludeIds.has(member.id)) continue
    if (member.tags.length === 0) continue

    const otherIndustry = member.tags.filter((t) => t.category === 'industry')
    const otherInterest = member.tags.filter((t) => t.category === 'interest')
    const otherNeed = member.tags.filter((t) => t.category === 'need')

    let needToIndustryCount = 0
    const needMatchDescriptions: string[] = []

    for (const need of targetNeed) {
      const needLower = need.name.toLowerCase()
      for (const ind of otherIndustry) {
        if (needLower.includes(ind.name.toLowerCase())) {
          needToIndustryCount++
          needMatchDescriptions.push(
            `${targetName} is looking for ${need.name}; ${member.name} is in ${ind.name}`,
          )
        }
      }
    }
    for (const need of otherNeed) {
      const needLower = need.name.toLowerCase()
      for (const ind of targetIndustry) {
        if (needLower.includes(ind.name.toLowerCase())) {
          needToIndustryCount++
          needMatchDescriptions.push(
            `${member.name} is looking for ${need.name}; ${targetName} is in ${ind.name}`,
          )
        }
      }
    }

    let sharedIndustryCount = 0
    const sharedTagNames: string[] = []
    for (const ind of otherIndustry) {
      if (targetIndustryIds.has(ind.tagId)) {
        sharedIndustryCount++
        sharedTagNames.push(ind.name)
      }
    }

    let sharedInterestCount = 0
    for (const int of otherInterest) {
      if (targetInterestIds.has(int.tagId)) {
        sharedInterestCount++
        sharedTagNames.push(int.name)
      }
    }

    const rawScore = needToIndustryCount * 3 + sharedIndustryCount * 1 + sharedInterestCount * 0.5
    if (rawScore === 0) continue
    if (rawScore > maxRaw) maxRaw = rawScore

    const matchReason =
      needMatchDescriptions.length > 0
        ? needMatchDescriptions.join('. ') + '.'
        : sharedTagNames.length > 0
          ? `Both share: ${sharedTagNames.join(', ')}`
          : ''

    scored.push({ member, score: rawScore, sharedTags: sharedTagNames, matchReason })
  }

  if (maxRaw > 0) {
    for (const s of scored) s.score = s.score / maxRaw
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 10)
}

// Order two member ids to satisfy the introductions_ordered_members
// constraint (member_a_id < member_b_id).
export function orderedPair(id1: string, id2: string): [string, string] {
  return id1 < id2 ? [id1, id2] : [id2, id1]
}

// ── Suggestion-engine scoring ─────────────────────────────────────────────
//
// A SYMMETRIC, RAW (un-normalised) pairwise score used by the bulk
// suggestion generator. Unlike `scoreMatches` — which normalises each
// target's set so its best match is always 100% and therefore isn't
// comparable across targets — this returns an absolute score so the engine
// can rank every candidate pair on one global scale. Deterministic and
// explainable: no LLM calls.
//
// Signals (doc-aligned: Industry, Goals/looking-for, can-help, Interests):
//   need→industry tag (either direction)  × 3   (strongest — an explicit need met)
//   complementary looking-for ↔ offer/does × 2   per shared keyword (capped)
//   shared sector field                    × 1.5
//   shared industry tag                    × 1
//   shared sub-sector field                × 1
//   shared interest tag                    × 0.5

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'who', 'are',
  'our', 'their', 'looking', 'want', 'wants', 'need', 'needs', 'help', 'helping',
  'people', 'company', 'companies', 'business', 'businesses', 'someone', 'anyone',
  'more', 'other', 'others', 'work', 'working', 'them', 'they', 'have', 'has',
  'can', 'offer', 'offers', 'services', 'service', 'clients', 'client',
])

function keywords(text: string | null | undefined): Set<string> {
  if (!text) return new Set()
  const out = new Set<string>()
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 4) continue
    if (STOPWORDS.has(raw)) continue
    out.add(raw)
  }
  return out
}

function overlap(a: Set<string>, b: Set<string>): string[] {
  const shared: string[] = []
  for (const w of a) if (b.has(w)) shared.push(w)
  return shared
}

export interface PairScore {
  score: number
  matchReason: string
  sharedTags: string[]
}

/**
 * Raw comparable score for a candidate introduction between two members.
 * Returns null when there is no signal at all.
 */
export function scorePairForSuggestion(a: MatchCandidate, b: MatchCandidate): PairScore | null {
  const reasons: string[] = []
  const sharedTags: string[] = []
  let score = 0

  const aIndustry = a.tags.filter((t) => t.category === 'industry')
  const bIndustry = b.tags.filter((t) => t.category === 'industry')
  const aNeed = a.tags.filter((t) => t.category === 'need')
  const bNeed = b.tags.filter((t) => t.category === 'need')
  const aInterestIds = new Set(a.tags.filter((t) => t.category === 'interest').map((t) => t.tagId))
  const aIndustryIds = new Set(aIndustry.map((t) => t.tagId))

  // need → industry (a's need meets b's industry, and vice versa)
  const needToIndustry = (
    needs: MemberTag[],
    industries: MemberTag[],
    seeker: string,
    provider: string,
  ) => {
    for (const need of needs) {
      const needLower = need.name.toLowerCase()
      for (const ind of industries) {
        if (needLower.includes(ind.name.toLowerCase())) {
          score += 3
          reasons.push(`${seeker} is looking for ${need.name}; ${provider} is in ${ind.name}`)
        }
      }
    }
  }
  needToIndustry(aNeed, bIndustry, a.name, b.name)
  needToIndustry(bNeed, aIndustry, b.name, a.name)

  // shared industry tags
  for (const ind of bIndustry) {
    if (aIndustryIds.has(ind.tagId)) {
      score += 1
      sharedTags.push(ind.name)
    }
  }
  // shared interest tags
  for (const int of b.tags.filter((t) => t.category === 'interest')) {
    if (aInterestIds.has(int.tagId)) {
      score += 0.5
      sharedTags.push(int.name)
    }
  }

  // shared sector / sub-sector (profile fields)
  const aSector = a.sector?.trim().toLowerCase()
  const bSector = b.sector?.trim().toLowerCase()
  if (aSector && bSector && aSector === bSector) {
    score += 1.5
    reasons.push(`Both in ${a.sector!.trim()}`)
  }
  const aSub = a.subSector?.trim().toLowerCase()
  const bSub = b.subSector?.trim().toLowerCase()
  if (aSub && bSub && aSub === bSub) {
    score += 1
    reasons.push(`Both focus on ${a.subSector!.trim()}`)
  }

  // Complementary: A is looking for X ↔ B does/offers X (both directions).
  // Match A's "looking for" text against B's sector/sub-sector/offer text.
  const complementary = (seeker: MatchCandidate, provider: MatchCandidate) => {
    const wants = keywords(`${seeker.introTargetTypes ?? ''} ${seeker.introTargetCriteria ?? ''}`)
    if (wants.size === 0) return
    const provides = keywords(
      `${provider.whatTheyCanOffer ?? ''} ${provider.sector ?? ''} ${provider.subSector ?? ''}`,
    )
    const shared = overlap(wants, provides).slice(0, 3)
    if (shared.length > 0) {
      score += 2 * shared.length
      reasons.push(
        `${seeker.name} is looking for ${shared.join(', ')}; ${provider.name} offers/does related work`,
      )
    }
  }
  complementary(a, b)
  complementary(b, a)

  if (score === 0) return null

  const matchReason =
    reasons.length > 0
      ? reasons.join('. ') + '.'
      : sharedTags.length > 0
        ? `Both share: ${sharedTags.join(', ')}`
        : ''

  return { score, matchReason, sharedTags }
}
