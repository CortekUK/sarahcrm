// Server-side introduction SUGGESTION engine.
//
// Pure, no I/O. Given all active member candidates (with tags + profile
// signals) and the set of pairs that ALREADY have an introduction row, it
// produces the top new cross-member introduction suggestions to persist at
// status 'suggested'.
//
// Scoring uses `scorePairForSuggestion` — a SYMMETRIC, RAW pairwise score —
// evaluated once per unique pair. Because the score is absolute (not
// per-target normalised the way `scoreMatches` is), every suggestion is
// ranked on ONE global scale, and the displayed 0–100 is that raw score
// mapped against the strongest match in the batch — so the numbers are
// comparable across all rows.

import { scorePairForSuggestion, orderedPair, type MatchCandidate } from './matching'

export interface Suggestion {
  memberAId: string
  memberBId: string
  matchScore: number
  matchReason: string
  matchingTags: string[]
}

// Ordered "a:b" key for a pair, matching the DB member_a_id < member_b_id
// constraint so it can be compared against existing intros.
export function pairKey(id1: string, id2: string): string {
  const [a, b] = orderedPair(id1, id2)
  return `${a}:${b}`
}

export interface SuggestOptions {
  // Minimum GLOBAL score (0–1, relative to the batch's strongest match) a
  // suggestion must reach to be kept.
  minScore?: number
  // Maximum number of suggestions returned globally.
  cap?: number
}

interface RawSuggestion {
  memberAId: string
  memberBId: string
  raw: number
  matchReason: string
  matchingTags: string[]
}

export function generateSuggestions(
  candidates: MatchCandidate[],
  existingPairKeys: Set<string>,
  opts: SuggestOptions = {},
): Suggestion[] {
  const minScore = opts.minScore ?? 0.5
  const cap = opts.cap ?? 20

  // Score every unique cross-member pair once, on a global raw scale.
  const raw: RawSuggestion[] = []
  let maxRaw = 0

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]
      const b = candidates[j]
      const key = pairKey(a.id, b.id)
      // Never re-suggest a pair that already has an introduction (any status).
      if (existingPairKeys.has(key)) continue
      const result = scorePairForSuggestion(a, b)
      if (!result) continue
      if (result.score > maxRaw) maxRaw = result.score
      const [aId, bId] = orderedPair(a.id, b.id)
      raw.push({
        memberAId: aId,
        memberBId: bId,
        raw: result.score,
        matchReason: result.matchReason,
        matchingTags: result.sharedTags,
      })
    }
  }

  if (maxRaw === 0) return []

  // Normalise against the GLOBAL max so scores are comparable across all rows,
  // then keep only sufficiently strong matches.
  return raw
    .map((r) => ({
      memberAId: r.memberAId,
      memberBId: r.memberBId,
      matchScore: r.raw / maxRaw,
      matchReason: r.matchReason,
      matchingTags: r.matchingTags,
    }))
    .filter((s) => s.matchScore >= minScore)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, cap)
}
