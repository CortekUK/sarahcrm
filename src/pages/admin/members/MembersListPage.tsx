import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase/client'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Badge } from '../../../components/ui/Badge'
import { Avatar } from '../../../components/ui/Avatar'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/Table'
import { formatDate } from '../../../lib/utils'
import { Plus, Search } from 'lucide-react'
import { AddMemberModal } from './AddMemberModal'
import type { Database } from '../../../types/database'

type MemberStatus = Database['public']['Enums']['membership_status']
type MemberTier = Database['public']['Enums']['membership_tier']

interface MemberRow {
  id: string
  membership_tier: MemberTier
  membership_status: MemberStatus
  intros_used_this_month: number
  monthly_intro_quota: number
  company_name: string | null
  created_at: string
  profiles: {
    first_name: string | null
    last_name: string | null
    email: string | null
    avatar_url: string | null
    company_name: string | null
  }
  member_tags: {
    tags: {
      name: string
    }
  }[]
}

const statusVariant: Record<MemberStatus, 'active' | 'upcoming' | 'draft' | 'urgent'> = {
  active: 'active',
  pending: 'upcoming',
  expired: 'draft',
  cancelled: 'urgent',
}

const tierLabels: Record<MemberTier, string> = {
  tier_1: 'Tier 1',
  tier_2: 'Tier 2',
  tier_3: 'Tier 3',
}

const tierOptions = [
  { value: '', label: 'All Tiers' },
  { value: 'tier_1', label: 'Tier 1' },
  { value: 'tier_2', label: 'Tier 2' },
  { value: 'tier_3', label: 'Tier 3' },
]

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function MembersListPage() {
  const navigate = useNavigate()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    fetchMembers()
  }, [])

  async function fetchMembers() {
    const { data, error } = await supabase
      .from('members')
      .select(`
        id,
        membership_tier,
        membership_status,
        intros_used_this_month,
        monthly_intro_quota,
        company_name,
        created_at,
        profiles (
          first_name,
          last_name,
          email,
          avatar_url,
          company_name
        ),
        member_tags (
          tags (
            name
          )
        )
      `)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setMembers(data as unknown as MemberRow[])
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return members.filter((m) => {
      // Search filter
      if (search) {
        const q = search.toLowerCase()
        const name = `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.toLowerCase()
        const company = (m.company_name ?? m.profiles?.company_name ?? '').toLowerCase()
        const email = (m.profiles?.email ?? '').toLowerCase()
        if (!name.includes(q) && !company.includes(q) && !email.includes(q)) {
          return false
        }
      }
      // Tier filter
      if (tierFilter && m.membership_tier !== tierFilter) return false
      // Status filter
      if (statusFilter && m.membership_status !== statusFilter) return false
      return true
    })
  }, [members, search, tierFilter, statusFilter])

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading members...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
            Members
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {members.length} member{members.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setShowAddModal(true)}>
          Add Member
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div className="flex-1 min-w-[240px] max-w-sm">
          <div className="relative">
            <Search
              size={16}
              strokeWidth={1.5}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
            />
            <input
              type="text"
              placeholder="Search by name, company, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-dim focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]"
            />
          </div>
        </div>
        <div className="w-40">
          <Select
            options={tierOptions}
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
          />
        </div>
        <div className="w-40">
          <Select
            options={statusOptions}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-card)]">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-text-dim">
              {search || tierFilter || statusFilter
                ? 'No members match your filters'
                : 'No members yet'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Intros</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((member) => {
                const name = `${member.profiles?.first_name ?? ''} ${member.profiles?.last_name ?? ''}`.trim()
                const company = member.company_name ?? member.profiles?.company_name

                return (
                  <TableRow
                    key={member.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/dashboard/members/${member.id}`)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar
                          src={member.profiles?.avatar_url}
                          name={name || member.profiles?.email || '?'}
                          size="sm"
                        />
                        <div>
                          <p className="font-medium text-text">
                            {name || 'Unnamed'}
                          </p>
                          <p className="text-xs text-text-dim">
                            {member.profiles?.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {company || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="info">{tierLabels[member.membership_tier]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[member.membership_status]} dot>
                        {member.membership_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-text">{member.intros_used_this_month}</span>
                      <span className="text-text-dim"> / {member.monthly_intro_quota}</span>
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {formatDate(member.created_at)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Add Member Modal */}
      <AddMemberModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false)
          fetchMembers()
        }}
      />
    </div>
  )
}
