import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase/client'
import { Modal } from '../../../components/ui/Modal'
import { Button } from '../../../components/ui/Button'
import { Search, Sparkles } from 'lucide-react'
import { CreateIntroductionModal } from './CreateIntroductionModal'

interface MemberOption {
  id: string
  name: string
  company: string | null
}

interface MemberTag {
  tagId: string
  name: string
  category: string
}

interface MemberWithTags {
  id: string
  name: string
  company: string | null
  tags: MemberTag[]
}

interface MatchResult {
  member: MemberWithTags
  score: number
  sharedTags: string[]
  matchReason: string
}

const CATEGORY_STYLES: Record<string, string> = {
  industry: 'bg-gold-muted text-gold border border-border-gold',
  interest: 'bg-[rgba(90,123,150,0.1)] text-[#5A7B96] border border-[rgba(90,123,150,0.25)]',
  need: 'bg-[rgba(111,143,122,0.1)] text-[#5C8A6B] border border-[rgba(111,143,122,0.3)]',
}

interface SuggestMatchesModalProps {
  open: boolean
  onClose: () => void
  onIntroCreated: () => void
}

export function SuggestMatchesModal({ open, onClose, onIntroCreated }: SuggestMatchesModalProps) {
  const [members, setMembers] = useState<MemberOption[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [query, setQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [results, setResults] = useState<MatchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [noTags, setNoTags] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Create modal state
  const [createOpen, setCreateOpen] = useState(false)
  const [prefillA, setPrefillA] = useState('')
  const [prefillB, setPrefillB] = useState('')
  const [prefillMatchReason, setPrefillMatchReason] = useState('')

  useEffect(() => {
    if (open) {
      fetchMembers()
      setSelectedMemberId('')
      setQuery('')
      setResults([])
      setNoTags(false)
      setHasSearched(false)
    }
  }, [open])

  async function fetchMembers() {
    const { data } = await supabase
      .from('members')
      .select('id, company_name, profiles(first_name, last_name, company_name)')
      .eq('membership_status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (data) {
      setMembers(
        (data as unknown as Array<{
          id: string
          company_name: string | null
          profiles: { first_name: string | null; last_name: string | null; company_name: string | null }
        }>).map((m) => ({
          id: m.id,
          name: `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim() || 'Unnamed',
          company: m.company_name ?? m.profiles?.company_name ?? null,
        }))
      )
    }
  }

  const filteredMembers = members.filter((m) => {
    if (!query) return true
    const q = query.toLowerCase()
    return m.name.toLowerCase().includes(q) || (m.company ?? '').toLowerCase().includes(q)
  })

  const selectedMember = members.find((m) => m.id === selectedMemberId)

  const findMatches = useCallback(async () => {
    if (!selectedMemberId) return
    setLoading(true)
    setNoTags(false)
    setHasSearched(true)

    // Fetch all active members with their tags (including category)
    const { data: allMemberTags } = await supabase
      .from('member_tags')
      .select('member_id, tag_id, tags(name, category)')

    if (!allMemberTags) {
      setLoading(false)
      return
    }

    // Build member → tags map
    const memberTagMap = new Map<string, MemberTag[]>()
    for (const row of allMemberTags as unknown as Array<{ member_id: string; tag_id: string; tags: { name: string; category: string } }>) {
      const existing = memberTagMap.get(row.member_id) ?? []
      existing.push({ tagId: row.tag_id, name: row.tags?.name ?? '', category: row.tags?.category ?? '' })
      memberTagMap.set(row.member_id, existing)
    }

    const targetTags = memberTagMap.get(selectedMemberId)
    if (!targetTags || targetTags.length === 0) {
      setNoTags(true)
      setResults([])
      setLoading(false)
      return
    }

    // Fetch existing introductions for the selected member
    const { data: existingIntros } = await supabase
      .from('introductions')
      .select('member_a_id, member_b_id')
      .or(`member_a_id.eq.${selectedMemberId},member_b_id.eq.${selectedMemberId}`)

    const pairedIds = new Set<string>()
    if (existingIntros) {
      for (const intro of existingIntros) {
        pairedIds.add(intro.member_a_id === selectedMemberId ? intro.member_b_id : intro.member_a_id)
      }
    }

    // Split target's tags by category
    const targetIndustry = targetTags.filter((t) => t.category === 'industry')
    const targetInterest = targetTags.filter((t) => t.category === 'interest')
    const targetNeed = targetTags.filter((t) => t.category === 'need')
    const targetInterestIds = new Set(targetInterest.map((t) => t.tagId))
    const targetIndustryIds = new Set(targetIndustry.map((t) => t.tagId))

    const selectedMemberObj = members.find((m) => m.id === selectedMemberId)
    const targetName = selectedMemberObj?.name ?? 'Member'

    // Score all other members using weighted algorithm
    const scored: MatchResult[] = []
    let maxRaw = 0

    for (const member of members) {
      if (member.id === selectedMemberId) continue
      if (pairedIds.has(member.id)) continue

      const otherTags = memberTagMap.get(member.id)
      if (!otherTags || otherTags.length === 0) continue

      const otherIndustry = otherTags.filter((t) => t.category === 'industry')
      const otherInterest = otherTags.filter((t) => t.category === 'interest')
      const otherNeed = otherTags.filter((t) => t.category === 'need')
      // Need-to-industry matching (both directions)
      let needToIndustryCount = 0
      const needMatchDescriptions: string[] = []

      // Target's needs vs other's industries
      for (const need of targetNeed) {
        const needLower = need.name.toLowerCase()
        for (const ind of otherIndustry) {
          if (needLower.includes(ind.name.toLowerCase())) {
            needToIndustryCount++
            needMatchDescriptions.push(
              `${targetName} is looking for ${need.name}; ${member.name} is in ${ind.name}`
            )
          }
        }
      }
      // Other's needs vs target's industries
      for (const need of otherNeed) {
        const needLower = need.name.toLowerCase()
        for (const ind of targetIndustry) {
          if (needLower.includes(ind.name.toLowerCase())) {
            needToIndustryCount++
            needMatchDescriptions.push(
              `${member.name} is looking for ${need.name}; ${targetName} is in ${ind.name}`
            )
          }
        }
      }

      // Shared industry tags
      let sharedIndustryCount = 0
      const sharedTagNames: string[] = []
      for (const ind of otherIndustry) {
        if (targetIndustryIds.has(ind.tagId)) {
          sharedIndustryCount++
          sharedTagNames.push(ind.name)
        }
      }

      // Shared interest tags
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

      // Build match reason from need-to-industry descriptions
      const matchReason = needMatchDescriptions.length > 0
        ? needMatchDescriptions.join('. ') + '.'
        : sharedTagNames.length > 0
          ? `Both share: ${sharedTagNames.join(', ')}`
          : ''

      scored.push({
        member: {
          ...member,
          tags: otherTags,
        },
        score: rawScore,
        sharedTags: sharedTagNames,
        matchReason,
      })
    }

    // Normalise scores so top match = 1 (100%)
    if (maxRaw > 0) {
      for (const s of scored) {
        s.score = s.score / maxRaw
      }
    }

    scored.sort((a, b) => b.score - a.score)
    setResults(scored.slice(0, 10))
    setLoading(false)
  }, [selectedMemberId, members])

  function openCreateFromMatch(matchMemberId: string, matchReason: string) {
    setPrefillA(selectedMemberId)
    setPrefillB(matchMemberId)
    setPrefillMatchReason(matchReason)
    setCreateOpen(true)
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Suggest Matches" size="xl">
        {/* Member picker */}
        <div className="mb-6">
          <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
            Select Member
          </label>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search
                size={16}
                strokeWidth={1.5}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
              />
              <input
                type="text"
                placeholder={selectedMember ? `${selectedMember.name}${selectedMember.company ? ` — ${selectedMember.company}` : ''}` : 'Search members...'}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setShowDropdown(true)
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                className="w-full pl-9 pr-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-dim focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]"
              />
              {showDropdown && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-surface border border-border rounded-[var(--radius-md)] shadow-lg max-h-48 overflow-y-auto">
                  {filteredMembers.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-text-dim">No members found</div>
                  ) : (
                    filteredMembers.slice(0, 20).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setSelectedMemberId(m.id)
                          setQuery('')
                          setShowDropdown(false)
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 transition-colors"
                      >
                        <span className="font-medium text-text">{m.name}</span>
                        {m.company && <span className="text-text-dim ml-1">— {m.company}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <Button
              icon={<Sparkles size={16} />}
              onClick={findMatches}
              disabled={!selectedMemberId}
              loading={loading}
            >
              Find Matches
            </Button>
          </div>
        </div>

        {/* Results */}
        {noTags && (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-text-dim">
              This member has no tags. Add tags to their profile to enable matching.
            </p>
          </div>
        )}

        {!noTags && hasSearched && !loading && results.length === 0 && (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-text-dim">No matches found for this member.</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {results.map((result) => (
              <div
                key={result.member.id}
                className="flex items-start justify-between p-4 bg-surface border border-border rounded-[var(--radius-lg)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-text">{result.member.name}</p>
                    <span className="text-sm font-medium text-gold">
                      {Math.round(result.score * 100)}%
                    </span>
                  </div>
                  {result.member.company && (
                    <p className="text-sm text-text-muted mb-2">{result.member.company}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {result.member.tags.map((tag, i) => {
                      const isShared = result.sharedTags.includes(tag.name)
                      return (
                        <span
                          key={i}
                          className={
                            isShared
                              ? `px-2 py-0.5 text-xs rounded-full ${CATEGORY_STYLES[tag.category] ?? 'bg-gold-muted text-gold border border-border-gold'}`
                              : 'px-2 py-0.5 text-xs rounded-full bg-surface-2 text-text-dim border border-border'
                          }
                        >
                          {tag.name}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => openCreateFromMatch(result.member.id, result.matchReason)}
                  className="ml-4 shrink-0"
                >
                  Introduce
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <CreateIntroductionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false)
          onIntroCreated()
        }}
        prefillMemberA={prefillA}
        prefillMemberB={prefillB}
        prefillMatchReason={prefillMatchReason}
      />
    </>
  )
}
