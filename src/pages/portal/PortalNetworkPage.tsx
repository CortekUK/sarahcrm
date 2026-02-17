import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase/client'
import { Card, CardContent } from '../../components/ui/Card'
import { Avatar } from '../../components/ui/Avatar'
import { Modal } from '../../components/ui/Modal'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/utils'
import { Search, Users, CalendarDays, Handshake } from 'lucide-react'

function stripLookingFor(name: string) {
  return name.replace(/^Looking for /i, '')
}

const CATEGORY_LABELS: Record<string, string> = {
  industry: 'Industry',
  interest: 'Interests',
  need: 'Looking For',
}
const CATEGORY_ORDER = ['industry', 'interest', 'need']
const CATEGORY_STYLES: Record<string, string> = {
  industry: 'bg-gold-muted text-gold border border-border-gold',
  interest: 'bg-[rgba(90,123,150,0.1)] text-[#5A7B96] border border-[rgba(90,123,150,0.25)]',
  need: 'bg-[rgba(111,143,122,0.1)] text-[#5C8A6B] border border-[rgba(111,143,122,0.3)]',
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

  // Profile modal state
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [profileData, setProfileData] = useState<ProfileData | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)

  useEffect(() => {
    fetchNetwork()
  }, [])

  async function fetchNetwork() {
    // Fetch all active members with profiles
    const { data: membersData } = await supabase
      .from('members')
      .select('id, company_name, profiles(first_name, last_name, avatar_url, job_title)')
      .eq('membership_status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })

    if (!membersData) { setLoading(false); return }

    const memberIds = membersData.map((m) => m.id)

    // Fetch all member_tags with tag names and categories
    const { data: mtData } = await supabase
      .from('member_tags')
      .select('member_id, tags(name, category)')
      .in('member_id', memberIds)

    // Build tag map
    const tagsByMember: Record<string, { name: string; category: string }[]> = {}
    const industryTagSet = new Set<string>()
    const needTagSet = new Set<string>()

    if (mtData) {
      for (const row of mtData as unknown as Array<{ member_id: string; tags: { name: string; category: string } | null }>) {
        if (!row.tags) continue
        if (!tagsByMember[row.member_id]) tagsByMember[row.member_id] = []
        tagsByMember[row.member_id].push({ name: row.tags.name, category: row.tags.category })
        if (row.tags.category === 'industry') {
          industryTagSet.add(row.tags.name)
        } else if (row.tags.category === 'need') {
          needTagSet.add(row.tags.name)
        }
      }
    }

    const networkMembers: NetworkMember[] = membersData.map((m) => {
      const p = m.profiles as unknown as { first_name: string | null; last_name: string | null; avatar_url: string | null; job_title: string | null }
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
        .select('company_name, company_description, profiles(first_name, last_name, avatar_url, job_title, bio)')
        .eq('id', id)
        .single(),
      supabase
        .from('member_tags')
        .select('tags(name, category)')
        .eq('member_id', id),
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
    const profile = member?.profiles as unknown as { first_name: string | null; last_name: string | null; avatar_url: string | null; job_title: string | null; bio: string | null } | null
    const rawTags = (tagsRes.data ?? []) as unknown as Array<{ tags: { name: string; category: string } | null }>

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
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.company?.toLowerCase().includes(q) ?? false)
      )
    }

    if (activeFilter) {
      result = result.filter((m) => m.tags.some((t) => t.name === activeFilter))
    }

    return result
  }, [members, search, activeFilter])

  // Group profile tags by category (keyed by raw category for styling lookup)
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
      <div className="flex items-center gap-3 py-12">
        <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
        <span className="text-sm text-text-muted">Loading network...</span>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
          The Network
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <Users size={14} className="text-text-dim" />
          <p className="text-sm text-text-muted">
            {members.length} {members.length === 1 ? 'member' : 'members'} in The Club
          </p>
        </div>
      </div>

      {/* Search + filters */}
      <div className="mb-6 space-y-4">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or company..."
            className="w-full pl-10 pr-4 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-dim focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]"
          />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-text-dim mr-1">Industry</span>
            <button
              onClick={() => setActiveFilter(null)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border transition-colors',
                activeFilter === null
                  ? 'bg-gold text-white border-gold'
                  : 'bg-surface text-text-muted border-border hover:border-gold hover:text-gold'
              )}
            >
              All
            </button>
            {allIndustryTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveFilter(activeFilter === tag ? null : tag)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-full border transition-colors',
                  activeFilter === tag
                    ? 'bg-gold text-white border-gold'
                    : 'bg-surface text-text-muted border-border hover:border-gold hover:text-gold'
                )}
              >
                {tag}
              </button>
            ))}
          </div>
          {allNeedTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-text-dim mr-1">Looking For</span>
              {allNeedTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveFilter(activeFilter === tag ? null : tag)}
                  className={cn(
                    'px-3 py-1.5 text-xs rounded-full border transition-colors',
                    activeFilter === tag
                      ? 'bg-gold text-white border-gold'
                      : 'bg-surface text-text-muted border-border hover:border-gold hover:text-gold'
                  )}
                >
                  {stripLookingFor(tag)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Results count */}
      {(search || activeFilter) && (
        <p className="text-xs text-text-dim mb-4">
          {filtered.length} {filtered.length === 1 ? 'member' : 'members'} found
        </p>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-text-dim">No members match your search</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((member) => (
            <Card
              key={member.id}
              className="hover:shadow-[var(--shadow-card-hover)] transition-shadow cursor-pointer"
              onClick={() => openProfile(member.id)}
            >
              <CardContent className="py-5">
                <div className="flex items-start gap-4">
                  <Avatar name={member.name} src={member.avatarUrl} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-text truncate">
                      {member.name}
                    </h3>
                    {member.jobTitle && (
                      <p className="text-xs text-text-muted truncate">{member.jobTitle}</p>
                    )}
                    {member.company && (
                      <p className="text-xs text-text-dim truncate">{member.company}</p>
                    )}
                  </div>
                </div>
                {(() => {
                  const cardTags = member.tags.filter((t) => t.category === 'industry' || t.category === 'need')
                  if (cardTags.length === 0) return null
                  return (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {cardTags.slice(0, 3).map((tag) => (
                        <span
                          key={tag.name}
                          className={`px-2 py-0.5 text-[0.6875rem] rounded-full ${CATEGORY_STYLES[tag.category] ?? 'bg-gold-muted text-gold border border-border-gold'}`}
                        >
                          {tag.category === 'need' ? stripLookingFor(tag.name) : tag.name}
                        </span>
                      ))}
                      {cardTags.length > 3 && (
                        <span className="px-2 py-0.5 text-[0.6875rem] rounded-full bg-surface-2 text-text-dim">
                          +{cardTags.length - 3}
                        </span>
                      )}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Profile modal */}
      <Modal open={selectedMemberId !== null} onClose={closeProfile} size="md">
        {profileLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
            <span className="ml-3 text-sm text-text-muted">Loading profile...</span>
          </div>
        ) : profileData ? (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col items-center text-center">
              <Avatar name={fullName} src={profileData.avatarUrl} size="xl" />
              <h2 className="mt-3 font-[family-name:var(--font-heading)] text-xl font-semibold text-text">
                {fullName}
              </h2>
              {profileData.jobTitle && (
                <p className="text-sm text-text-muted">{profileData.jobTitle}</p>
              )}
              {profileData.companyName && (
                <p className="text-sm text-text-dim">{profileData.companyName}</p>
              )}
              {profileData.companyDescription && (
                <p className="mt-1 text-xs text-text-dim italic">{profileData.companyDescription}</p>
              )}
            </div>

            {/* Bio */}
            {profileData.bio && (
              <p className="text-sm text-text-muted leading-relaxed">{profileData.bio}</p>
            )}

            {/* Stats row */}
            <div className="flex items-center justify-center gap-8">
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <CalendarDays size={16} className="text-gold" />
                <span className="font-semibold text-text">{profileData.eventsAttended}</span>
                events attended
              </div>
              <div className="flex items-center gap-2 text-sm text-text-muted">
                <Handshake size={16} className="text-gold" />
                <span className="font-semibold text-text">{profileData.introductions}</span>
                introductions
              </div>
            </div>

            {/* Tags grouped by category */}
            {Object.keys(groupedTags).length > 0 && (
              <div className="space-y-3">
                {CATEGORY_ORDER
                  .filter((cat) => groupedTags[cat]?.length > 0)
                  .map((category) => (
                  <div key={category}>
                    <p className="text-xs font-medium text-text-dim uppercase tracking-wide mb-1.5">
                      {CATEGORY_LABELS[category] ?? category}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {groupedTags[category].map((name) => (
                        <span
                          key={name}
                          className={`px-2.5 py-0.5 text-xs rounded-full ${CATEGORY_STYLES[category] ?? 'bg-gold-muted text-gold border border-border-gold'}`}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Request Introduction button */}
            <Button
              variant="primary"
              className="w-full"
              icon={<Handshake size={16} />}
              onClick={handleRequestIntroduction}
            >
              Request Introduction
            </Button>
          </div>
        ) : null}
      </Modal>

      {/* Toast */}
      {toastVisible && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 bg-text text-surface text-sm rounded-full shadow-lg animate-[modal-enter_0.2s_ease-out]">
          Introduction request sent to The Club team
        </div>
      )}
    </div>
  )
}
