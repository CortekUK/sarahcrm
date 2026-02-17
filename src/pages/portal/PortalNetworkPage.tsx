import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase/client'
import { Card, CardContent } from '../../components/ui/Card'
import { Avatar } from '../../components/ui/Avatar'
import { cn } from '../../lib/utils'
import { Search, Users } from 'lucide-react'

interface NetworkMember {
  id: string
  name: string
  company: string | null
  jobTitle: string | null
  avatarUrl: string | null
  tags: string[]
}

export function PortalNetworkPage() {
  const [members, setMembers] = useState<NetworkMember[]>([])
  const [allIndustryTags, setAllIndustryTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<string | null>(null)

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
    const tagsByMember: Record<string, string[]> = {}
    const industryTagSet = new Set<string>()

    if (mtData) {
      for (const row of mtData as unknown as Array<{ member_id: string; tags: { name: string; category: string } }>) {
        if (!tagsByMember[row.member_id]) tagsByMember[row.member_id] = []
        tagsByMember[row.member_id].push(row.tags.name)
        if (row.tags.category === 'industry') {
          industryTagSet.add(row.tags.name)
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
    setLoading(false)
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
      result = result.filter((m) => m.tags.includes(activeFilter))
    }

    return result
  }, [members, search, activeFilter])

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

        <div className="flex flex-wrap gap-2">
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
            <Card key={member.id} className="hover:shadow-[var(--shadow-card-hover)] transition-shadow">
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
                {member.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {member.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 text-[0.6875rem] rounded-full bg-gold-muted text-gold border border-border-gold"
                      >
                        {tag}
                      </span>
                    ))}
                    {member.tags.length > 3 && (
                      <span className="px-2 py-0.5 text-[0.6875rem] rounded-full bg-surface-2 text-text-dim">
                        +{member.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
