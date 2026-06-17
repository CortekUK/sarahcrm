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
