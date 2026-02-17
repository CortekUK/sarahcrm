import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase/client'
import { Button } from '../../../components/ui/Button'
import { Select } from '../../../components/ui/Select'
import { Badge } from '../../../components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/Table'
import { formatDate } from '../../../lib/utils'
import { Plus, Search, Sparkles } from 'lucide-react'
import { CreateIntroductionModal } from './CreateIntroductionModal'
import { SuggestMatchesModal } from './SuggestMatchesModal'
import type { Database } from '../../../types/database'

type IntroStatus = Database['public']['Enums']['intro_status']

interface IntroRow {
  id: string
  status: IntroStatus
  match_score: number | null
  suggested_at: string
  event_id: string | null
  member_a: {
    profiles: {
      first_name: string | null
      last_name: string | null
      company_name: string | null
    }
  }
  member_b: {
    profiles: {
      first_name: string | null
      last_name: string | null
      company_name: string | null
    }
  }
  events: { title: string } | null
}

const introStatusBadge: Record<IntroStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  suggested: 'draft',
  approved: 'upcoming',
  sent: 'info',
  accepted: 'active',
  completed: 'active',
  declined: 'urgent',
}

const statusOptions = [
  { value: '', label: 'All Statuses' },
  { value: 'suggested', label: 'Suggested' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'completed', label: 'Completed' },
  { value: 'declined', label: 'Declined' },
]

function memberName(profiles: { first_name: string | null; last_name: string | null } | null): string {
  if (!profiles) return 'Unknown'
  return `${profiles.first_name ?? ''} ${profiles.last_name ?? ''}`.trim() || 'Unnamed'
}

export function IntroductionsListPage() {
  const navigate = useNavigate()
  const [intros, setIntros] = useState<IntroRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showSuggestModal, setShowSuggestModal] = useState(false)

  useEffect(() => {
    fetchIntros()
  }, [])

  async function fetchIntros() {
    const { data, error } = await supabase
      .from('introductions')
      .select(`
        id,
        status,
        match_score,
        suggested_at,
        event_id,
        member_a:members!introductions_member_a_id_fkey(
          profiles(first_name, last_name, company_name)
        ),
        member_b:members!introductions_member_b_id_fkey(
          profiles(first_name, last_name, company_name)
        ),
        events(title)
      `)
      .order('suggested_at', { ascending: false })

    if (!error && data) {
      setIntros(data as unknown as IntroRow[])
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    return intros.filter((intro) => {
      if (search) {
        const q = search.toLowerCase()
        const nameA = memberName(intro.member_a?.profiles).toLowerCase()
        const nameB = memberName(intro.member_b?.profiles).toLowerCase()
        const companyA = (intro.member_a?.profiles?.company_name ?? '').toLowerCase()
        const companyB = (intro.member_b?.profiles?.company_name ?? '').toLowerCase()
        if (
          !nameA.includes(q) &&
          !nameB.includes(q) &&
          !companyA.includes(q) &&
          !companyB.includes(q)
        ) {
          return false
        }
      }
      if (statusFilter && intro.status !== statusFilter) return false
      return true
    })
  }, [intros, search, statusFilter])

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading introductions...</span>
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
            Introductions
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {intros.length} introduction{intros.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            icon={<Sparkles size={16} />}
            onClick={() => setShowSuggestModal(true)}
          >
            Suggest Matches
          </Button>
          <Button icon={<Plus size={16} />} onClick={() => setShowCreateModal(true)}>
            Create Introduction
          </Button>
        </div>
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
              placeholder="Search by member name or company..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-dim focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)]"
            />
          </div>
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
              {search || statusFilter
                ? 'No introductions match your filters'
                : 'No introductions yet'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Member A</TableHead>
                <TableHead>Member B</TableHead>
                <TableHead>Match Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Suggested</TableHead>
                <TableHead>Event</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((intro) => {
                const nameA = memberName(intro.member_a?.profiles)
                const nameB = memberName(intro.member_b?.profiles)
                const companyA = intro.member_a?.profiles?.company_name
                const companyB = intro.member_b?.profiles?.company_name

                return (
                  <TableRow
                    key={intro.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/dashboard/introductions/${intro.id}`)}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-text">{nameA}</p>
                        {companyA && (
                          <p className="text-xs text-text-dim">{companyA}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-text">{nameB}</p>
                        {companyB && (
                          <p className="text-xs text-text-dim">{companyB}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {intro.match_score != null ? (
                        <span className="text-gold font-medium">
                          {Math.round(intro.match_score * 100)}%
                        </span>
                      ) : (
                        <span className="text-text-dim">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={introStatusBadge[intro.status]} dot>
                        {intro.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {formatDate(intro.suggested_at)}
                    </TableCell>
                    <TableCell className="text-text-muted">
                      {intro.events?.title ?? '—'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Modals */}
      <CreateIntroductionModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false)
          fetchIntros()
        }}
      />

      <SuggestMatchesModal
        open={showSuggestModal}
        onClose={() => setShowSuggestModal(false)}
        onIntroCreated={() => {
          setShowSuggestModal(false)
          fetchIntros()
        }}
      />
    </div>
  )
}
