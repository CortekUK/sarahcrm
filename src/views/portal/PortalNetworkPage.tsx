'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/utils'
import { CalendarDays, Handshake, Search, Users } from 'lucide-react'
import {
  PortalButton,
  PortalCard,
  PortalEmptyState,
  PortalLoading,
  PortalModal,
  PortalPageHeader,
} from '@/components/portal/PortalChrome'

function stripLookingFor(name: string) {
  return name.replace(/^Looking for /i, '')
}

const CATEGORY_LABELS: Record<string, string> = {
  industry: 'Industry',
  interest: 'Interests',
  need: 'Looking For',
}
const CATEGORY_ORDER = ['industry', 'interest', 'need']

// Night-palette tag chips — all three categories share the bronze-on-graphite
// language so the page reads as one editorial set rather than three
// separately-coloured columns.
const CATEGORY_STYLES: Record<string, string> = {
  industry: 'border-bronze/45 bg-bronze/10 text-bronze-light',
  interest: 'border-graphite-line/55 bg-graphite/45 text-ivory-soft',
  need: 'border-emerald-700/45 bg-emerald-900/15 text-emerald-200',
}

interface NetworkMember {
  id: string
  name: string
  company: string | null
  jobTitle: string | null
  avatarUrl: string | null
  tags: { name: string; category: string }[]
}

interface ProfileData {
  firstName: string | null
  lastName: string | null
  avatarUrl: string | null
  jobTitle: string | null
  bio: string | null
  companyName: string | null
  companyDescription: string | null
  tags: { name: string; category: string }[]
  eventsAttended: number
  introductions: number
}

export function PortalNetworkPage() {
  const [members, setMembers] = useState<NetworkMember[]>([])
  const [allIndustryTags, setAllIndustryTags] = useState<string[]>([])
  const [allNeedTags, setAllNeedTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)

  useEffect(() => {
    fetchNetwork()
  }, [])

  async function fetchNetwork() {
    const { data: membersData } = await supabase
      .from('members')
      .select('id, company_name, profiles(first_name, last_name, avatar_url, job_title)')
      .eq('membership_status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (!membersData) {
      setLoading(false)
      return
    }
    const memberIds = membersData.map((m) => m.id)
    const { data: mtData } = await supabase
      .from('member_tags')
      .select('member_id, tags(name, category)')
      .in('member_id', memberIds)

    const tagsByMember: Record<string, { name: string; category: string }[]> = {}
    const industryTagSet = new Set<string>()
    const needTagSet = new Set<string>()

    if (mtData) {
      for (const row of mtData as unknown as Array<{
        member_id: string
        tags: { name: string; category: string } | null
      }>) {
        if (!row.tags) continue
        if (!tagsByMember[row.member_id]) tagsByMember[row.member_id] = []
        tagsByMember[row.member_id].push({ name: row.tags.name, category: row.tags.category })
        if (row.tags.category === 'industry') industryTagSet.add(row.tags.name)
        else if (row.tags.category === 'need') needTagSet.add(row.tags.name)
      }
    }

    const networkMembers: NetworkMember[] = membersData.map((m) => {
      const p = m.profiles as unknown as {
        first_name: string | null
        last_name: string | null
        avatar_url: string | null
        job_title: string | null
      }
      const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim()
      return {
        id: m.id,
        name: name || 'Member',
        company: m.company_name,
        jobTitle: p?.job_title,
        avatarUrl: p?.avatar_url,
        tags: tagsByMember[m.id] ?? [],
      }
    })

    setMembers(networkMembers)
    setAllIndustryTags(Array.from(industryTagSet).sort())
    setAllNeedTags(Array.from(needTagSet).sort())
    setLoading(false)
  }

  async function openProfile(id: string) {
    setSelectedMemberId(id)
    setProfileData(null)
    setProfileLoading(true)

    const [memberRes, tagsRes, bookingsRes, introsARes, introsBRes] = await Promise.all([
      supabase
        .from('members')
        .select(
          'company_name, company_description, profiles(first_name, last_name, avatar_url, job_title, bio)',
        )
        .eq('id', id)
        .single(),
      supabase.from('member_tags').select('tags(name, category)').eq('member_id', id),
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', id)
        .eq('status', 'confirmed'),
      supabase
        .from('introductions')
        .select('id', { count: 'exact', head: true })
        .eq('member_a_id', id),
      supabase
        .from('introductions')
        .select('id', { count: 'exact', head: true })
        .eq('member_b_id', id),
    ])

    const member = memberRes.data
    const profile = member?.profiles as unknown as {
      first_name: string | null
      last_name: string | null
      avatar_url: string | null
      job_title: string | null
      bio: string | null
    } | null
    const rawTags = (tagsRes.data ?? []) as unknown as Array<{
      tags: { name: string; category: string } | null
    }>

    setProfileData({
      firstName: profile?.first_name ?? null,
      lastName: profile?.last_name ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      jobTitle: profile?.job_title ?? null,
      bio: profile?.bio ?? null,
      companyName: member?.company_name ?? null,
      companyDescription: member?.company_description ?? null,
      tags: rawTags.filter((r) => r.tags !== null).map((r) => r.tags!),
      eventsAttended: bookingsRes.count ?? 0,
      introductions: (introsARes.count ?? 0) + (introsBRes.count ?? 0),
    })
    setProfileLoading(false)
  }

  function closeProfile() {
    setSelectedMemberId(null)
    setProfileData(null)
  }

  function handleRequestIntroduction() {
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 3000)
  }

  const filtered = useMemo(() => {
    let result = members
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (m) => m.name.toLowerCase().includes(q) || (m.company?.toLowerCase().includes(q) ?? false),
      )
    }
    if (activeFilter) {
      result = result.filter((m) => m.tags.some((t) => t.name === activeFilter))
    }
    return result
  }, [members, search, activeFilter])

  const groupedTags = useMemo(() => {
    if (!profileData) return {}
    const groups: Record<string, string[]> = {}
    for (const tag of profileData.tags) {
      if (!groups[tag.category]) groups[tag.category] = []
      groups[tag.category].push(tag.name)
    }
    return groups
  }, [profileData])

  const fullName = profileData
    ? `${profileData.firstName ?? ''} ${profileData.lastName ?? ''}`.trim() || 'Member'
    : ''

  if (loading) {
    return (
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12">
        <PortalLoading label="Loading the network" />
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
      <PortalPageHeader
        eyebrow={`${members.length} ${members.length === 1 ? 'Member' : 'Members'} · In Confidence`}
        title="The Network."
        subtitle="Members of The Club, briefly portrayed. Open a card to read more or request an introduction."
      />

      {/* Search + filters */}
      <div className="mb-10 space-y-5">
        <div className="relative max-w-md">
          <Search
            size={14}
            strokeWidth={1.5}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-haze pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or company"
            className="w-full pl-10 pr-4 py-3 bg-graphite/40 border border-graphite-line/60 rounded-full font-[family-name:var(--font-meta)] text-[12px] uppercase tracking-[0.16em] text-ivory placeholder:text-slate-dim focus:border-bronze/60 focus:outline-none transition-colors"
          />
        </div>

        <div className="space-y-4">
          <FilterRow label="Industry">
            <FilterChip
              label="All"
              active={activeFilter === null}
              onClick={() => setActiveFilter(null)}
            />
            {allIndustryTags.map((tag) => (
              <FilterChip
                key={tag}
                label={tag}
                active={activeFilter === tag}
                onClick={() => setActiveFilter(activeFilter === tag ? null : tag)}
              />
            ))}
          </FilterRow>

          {allNeedTags.length > 0 && (
            <FilterRow label="Looking For">
              {allNeedTags.map((tag) => (
                <FilterChip
                  key={tag}
                  label={stripLookingFor(tag)}
                  active={activeFilter === tag}
                  onClick={() => setActiveFilter(activeFilter === tag ? null : tag)}
                />
              ))}
            </FilterRow>
          )}
        </div>
      </div>

      {(search || activeFilter) && (
        <p className="mb-5 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.28em] text-slate-haze">
          {filtered.length} {filtered.length === 1 ? 'member' : 'members'} found
        </p>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <PortalEmptyState
          icon={<Users size={18} strokeWidth={1.5} />}
          title="No members match your search."
          description="Try a different keyword or clear the active filter."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
          {filtered.map((member) => (
            <PortalCard
              key={member.id}
              interactive
              onClick={() => openProfile(member.id)}
              className="p-6"
            >
              <div className="flex items-start gap-4">
                <Avatar name={member.name} src={member.avatarUrl} size="lg" />
                <div className="min-w-0 flex-1">
                  <h3 className="font-[family-name:var(--font-display)] text-[15.5px] text-ivory leading-tight truncate">
                    {member.name}
                  </h3>
                  {member.jobTitle && (
                    <p className="mt-1 font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.22em] text-bronze-light/85 truncate">
                      {member.jobTitle}
                    </p>
                  )}
                  {member.company && (
                    <p className="mt-1 font-[family-name:var(--font-editorial)] italic text-[12.5px] text-ivory-soft/80 truncate">
                      {member.company}
                    </p>
                  )}
                </div>
              </div>
              {(() => {
                const cardTags = member.tags.filter(
                  (t) => t.category === 'industry' || t.category === 'need',
                )
                if (cardTags.length === 0) return null
                return (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {cardTags.slice(0, 3).map((tag) => (
                      <span
                        key={tag.name}
                        className={cn(
                          'px-2.5 py-0.5 text-[9.5px] font-[family-name:var(--font-meta)] uppercase tracking-[0.18em] rounded-full border',
                          CATEGORY_STYLES[tag.category],
                        )}
                      >
                        {tag.category === 'need' ? stripLookingFor(tag.name) : tag.name}
                      </span>
                    ))}
                    {cardTags.length > 3 && (
                      <span className="px-2.5 py-0.5 text-[9.5px] font-[family-name:var(--font-meta)] uppercase tracking-[0.18em] rounded-full border border-graphite-line/45 bg-graphite/40 text-slate-haze">
                        +{cardTags.length - 3}
                      </span>
                    )}
                  </div>
                )
              })()}
            </PortalCard>
          ))}
        </div>
      )}

      {/* Profile modal */}
      <PortalModal open={selectedMemberId !== null} onClose={closeProfile} size="md">
        {profileLoading ? (
          <PortalLoading label="Loading profile" />
        ) : profileData ? (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center">
              <Avatar name={fullName} src={profileData.avatarUrl} size="xl" />
              <h2 className="mt-4 font-[family-name:var(--font-display)] text-[clamp(1.5rem,2vw,1.875rem)] text-ivory leading-tight">
                {fullName}
              </h2>
              {profileData.jobTitle && (
                <p className="mt-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-bronze-light">
                  {profileData.jobTitle}
                </p>
              )}
              {profileData.companyName && (
                <p className="mt-1 font-[family-name:var(--font-editorial)] italic text-[14px] text-ivory-soft/85">
                  {profileData.companyName}
                </p>
              )}
              {profileData.companyDescription && (
                <p className="mt-2 font-[family-name:var(--font-editorial)] italic text-[12.5px] text-slate-haze max-w-md">
                  {profileData.companyDescription}
                </p>
              )}
            </div>

            {profileData.bio && (
              <p className="font-[family-name:var(--font-editorial)] text-[14px] leading-[1.75] text-ivory-soft text-center max-w-lg mx-auto">
                {profileData.bio}
              </p>
            )}

            <div className="flex items-center justify-center gap-8 py-4 border-y border-graphite-line/45">
              <div className="text-center">
                <p className="font-[family-name:var(--font-display)] text-[22px] text-ivory tabular-nums">
                  {profileData.eventsAttended}
                </p>
                <p className="mt-1 font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.28em] text-bronze-light/85 flex items-center justify-center gap-1.5">
                  <CalendarDays size={11} strokeWidth={1.5} />
                  Events attended
                </p>
              </div>
              <span className="h-8 w-px bg-graphite-line/55" />
              <div className="text-center">
                <p className="font-[family-name:var(--font-display)] text-[22px] text-ivory tabular-nums">
                  {profileData.introductions}
                </p>
                <p className="mt-1 font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.28em] text-bronze-light/85 flex items-center justify-center gap-1.5">
                  <Handshake size={11} strokeWidth={1.5} />
                  Introductions
                </p>
              </div>
            </div>

            {Object.keys(groupedTags).length > 0 && (
              <div className="space-y-4">
                {CATEGORY_ORDER.filter((cat) => groupedTags[cat]?.length > 0).map((category) => (
                  <div key={category}>
                    <p className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light/85 mb-2">
                      {CATEGORY_LABELS[category] ?? category}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {groupedTags[category].map((name) => (
                        <span
                          key={name}
                          className={cn(
                            'px-3 py-1 text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-[0.18em] rounded-full border',
                            CATEGORY_STYLES[category] ?? CATEGORY_STYLES.industry,
                          )}
                        >
                          {category === 'need' ? stripLookingFor(name) : name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2">
              <PortalButton
                className="w-full justify-center"
                icon={<Handshake size={14} strokeWidth={1.5} />}
                onClick={handleRequestIntroduction}
              >
                Request introduction
              </PortalButton>
            </div>
          </div>
        ) : null}
      </PortalModal>

      {toastVisible && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 border border-bronze/55 bg-ink rounded-full font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-bronze-light shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)]">
          Introduction request sent to The Club
        </div>
      )}
    </div>
  )
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-[family-name:var(--font-meta)] text-[9.5px] uppercase tracking-[0.32em] text-bronze-light/85 mr-2">
        {label}
      </span>
      {children}
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={cn(
        'px-3.5 py-1.5 text-[10px] font-[family-name:var(--font-meta)] uppercase tracking-[0.22em] rounded-full border transition-all duration-300',
        active
          ? 'border-bronze bg-bronze/15 text-bronze-light'
          : 'border-graphite-line/55 bg-graphite/30 text-ivory/75 hover:border-bronze/55 hover:text-bronze-light',
      )}
    >
      {label}
    </button>
  )
}
