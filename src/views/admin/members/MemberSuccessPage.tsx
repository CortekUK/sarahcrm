'use client'

// Admin "Member Success" view — the members who need attention.
//
// Mirrors MembersListPage's shape (client component, House UI, filter chips +
// search, summary tiles, a constrained table). Data comes from
// GET /api/admin/members/success (flags + reasons computed on read from the
// persisted relationship scores, kept fresh by the daily memberSuccessSweep
// automation). "Recompute now" POSTs the existing recompute-scores route for
// admins who don't want to wait for the daily sweep.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { toast } from '@/lib/hooks/use-toast'
import { cn } from '@/lib/utils'
import {
  HeartPulse,
  Search,
  RefreshCw,
  AlertTriangle,
  CalendarClock,
  UserPlus,
  Moon,
  TrendingUp,
  Building2,
} from 'lucide-react'
import type { Database } from '@/types/database'

type MemberTier = Database['public']['Enums']['membership_tier']

type SuccessFlag =
  | 'at_risk'
  | 'renewal_soon'
  | 'no_intros'
  | 'dormant'
  | 'upgrade_ready'

interface FlaggedMember {
  id: string
  name: string
  email: string | null
  avatar_url: string | null
  company_name: string | null
  job_title: string | null
  membership_tier: MemberTier
  renewal_date: string | null
  renewal_in_days: number | null
  churn_risk_score: number
  engagement_score: number
  upgrade_potential: number
  last_attended: string | null
  intros_total: number
  flags: SuccessFlag[]
  reasons: string[]
}

interface SuccessResponse {
  members: FlaggedMember[]
  counts: Record<SuccessFlag, number>
  total: number
}

const tierLabels: Record<MemberTier, string> = {
  tier_1: 'Tier 1',
  tier_2: 'Tier 2',
  tier_3: 'Tier 3',
}

// Flag presentation — label, House-UI Badge variant, and tile icon.
const FLAG_META: Record<
  SuccessFlag,
  {
    label: string
    variant: 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'
    icon: React.ComponentType<{ size?: number; className?: string }>
  }
> = {
  at_risk: { label: 'At risk', variant: 'urgent', icon: AlertTriangle },
  renewal_soon: { label: 'Renewal soon', variant: 'upcoming', icon: CalendarClock },
  no_intros: { label: 'No introductions', variant: 'draft', icon: UserPlus },
  dormant: { label: 'Dormant', variant: 'draft', icon: Moon },
  upgrade_ready: { label: 'Upgrade ready', variant: 'active', icon: TrendingUp },
}

const FLAG_ORDER: SuccessFlag[] = [
  'at_risk',
  'renewal_soon',
  'no_intros',
  'dormant',
  'upgrade_ready',
]

// Colour a 0–100 score meter by severity. `invert` for engagement/upgrade,
// where HIGH is good; churn is the opposite (high = bad).
function scoreTone(value: number, invert: boolean): string {
  const good = invert ? value >= 60 : value < 40
  const bad = invert ? value < 40 : value >= 60
  if (bad) return 'text-accent-warm'
  if (good) return 'text-accent'
  return 'text-gold'
}

export function MemberSuccessPage() {
  const router = useRouter()
  const [data, setData] = useState<SuccessResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [recomputing, setRecomputing] = useState(false)
  const [search, setSearch] = useState('')
  const [activeFlag, setActiveFlag] = useState<SuccessFlag | 'all'>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/members/success')
      const json = await res.json()
      if (!res.ok) {
        toast({
          title: 'Failed to load member success',
          description: json.error,
          variant: 'destructive',
        })
      } else {
        setData(json as SuccessResponse)
      }
    } catch (e) {
      toast({
        title: 'Failed to load member success',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleRecompute() {
    setRecomputing(true)
    try {
      const res = await fetch('/api/admin/members/recompute-scores', { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Recompute failed', description: json.error, variant: 'destructive' })
      } else {
        toast({
          title: 'Scores recomputed',
          description: `${json.updated ?? 0} member${json.updated === 1 ? '' : 's'} updated.`,
        })
        await fetchData()
      }
    } catch (e) {
      toast({
        title: 'Recompute failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      })
    }
    setRecomputing(false)
  }

  const members = data?.members ?? []
  const counts = data?.counts

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return members.filter((m) => {
      if (activeFlag !== 'all' && !m.flags.includes(activeFlag)) return false
      if (!term) return true
      return (
        m.name.toLowerCase().includes(term) ||
        (m.company_name ?? '').toLowerCase().includes(term) ||
        (m.email ?? '').toLowerCase().includes(term)
      )
    })
  }, [members, search, activeFlag])

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading member success…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Member Success"
        description="Members needing attention. Health scores refresh automatically every day; each flag below explains why a member has surfaced, in plain English, with a link to their profile."
        meta={
          <span className="text-xs text-text-dim">
            {members.length} member{members.length === 1 ? '' : 's'} flagged
          </span>
        }
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={15} className={recomputing ? 'animate-spin' : ''} />}
            onClick={handleRecompute}
            disabled={recomputing}
          >
            {recomputing ? 'Recomputing…' : 'Recompute now'}
          </Button>
        }
      />

      {/* Summary tiles — one per flag, doubling as filter shortcuts */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-6">
        {FLAG_ORDER.map((flag) => {
          const meta = FLAG_META[flag]
          const Icon = meta.icon
          const active = activeFlag === flag
          return (
            <button
              key={flag}
              type="button"
              onClick={() => setActiveFlag((f) => (f === flag ? 'all' : flag))}
              className={cn(
                'text-left rounded-[var(--radius-lg)] border px-4 py-4 transition-colors',
                'bg-surface shadow-[var(--shadow-card)]',
                active ? 'border-gold' : 'border-border hover:border-border-hover',
              )}
            >
              <div className="flex items-center gap-1.5">
                <Icon
                  size={14}
                  className={
                    flag === 'at_risk'
                      ? 'text-accent-warm'
                      : flag === 'upgrade_ready'
                        ? 'text-accent'
                        : flag === 'renewal_soon'
                          ? 'text-gold'
                          : 'text-text-muted'
                  }
                />
                <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                  {meta.label}
                </p>
              </div>
              <p className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-semibold text-text mt-2">
                {counts?.[flag] ?? 0}
              </p>
            </button>
          )
        })}
      </div>

      {/* Filters — search + All chip */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 sm:max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim z-10"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, company, email…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveFlag('all')}
            className={cn(
              'px-3 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap',
              activeFlag === 'all'
                ? 'bg-gold text-white border-gold'
                : 'bg-[var(--color-surface)] text-text-muted border-border hover:border-border-hover hover:text-text',
            )}
          >
            All
            <span className="ml-1.5 opacity-70">{members.length}</span>
          </button>
          {FLAG_ORDER.map((flag) => (
            <button
              key={flag}
              onClick={() => setActiveFlag((f) => (f === flag ? 'all' : flag))}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap',
                activeFlag === flag
                  ? 'bg-gold text-white border-gold'
                  : 'bg-[var(--color-surface)] text-text-muted border-border hover:border-border-hover hover:text-text',
              )}
            >
              {FLAG_META[flag].label}
              <span className="ml-1.5 opacity-70">{counts?.[flag] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <AdminEmptyState
              icon={HeartPulse}
              title={members.length === 0 ? 'Everyone looks healthy' : 'No matches'}
              description={
                members.length === 0
                  ? 'No active members are currently flagged for attention. Scores refresh daily — or hit “Recompute now” to check immediately.'
                  : 'Try a different flag or clear your search.'
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table — constrained + wrapped in overflow-x-auto */}
          <Card className="hidden md:block">
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[880px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[240px]">Member</TableHead>
                    <TableHead className="min-w-[220px]">Flags</TableHead>
                    <TableHead className="w-[70px] text-center">Churn</TableHead>
                    <TableHead className="w-[80px] text-center">Engage</TableHead>
                    <TableHead className="w-[80px] text-center">Upgrade</TableHead>
                    <TableHead className="min-w-[180px]">Top reason</TableHead>
                    <TableHead className="w-[110px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => (
                    <TableRow
                      key={m.id}
                      className="cursor-pointer group"
                      onClick={() => router.push(`/dashboard/members/${m.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar src={m.avatar_url} name={m.name} size="sm" />
                          <div className="min-w-0">
                            <p className="text-[13.5px] font-medium text-text leading-snug truncate">
                              {m.name}
                            </p>
                            <p className="mt-0.5 text-[11px] text-text-dim truncate">
                              {m.company_name ? (
                                <>
                                  <Building2 size={10} className="inline mr-1" />
                                  {m.company_name}
                                </>
                              ) : (
                                tierLabels[m.membership_tier]
                              )}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {FLAG_ORDER.filter((f) => m.flags.includes(f)).map((f) => (
                            <Badge key={f} variant={FLAG_META[f].variant}>
                              {FLAG_META[f].label}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            scoreTone(m.churn_risk_score, false),
                          )}
                        >
                          {m.churn_risk_score}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            scoreTone(m.engagement_score, true),
                          )}
                        >
                          {m.engagement_score}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={cn(
                            'text-sm font-semibold',
                            scoreTone(m.upgrade_potential, true),
                          )}
                        >
                          {m.upgrade_potential}
                        </span>
                      </TableCell>
                      <TableCell className="text-text-muted">
                        <span className="text-xs line-clamp-2">
                          {m.reasons[0] ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/dashboard/members/${m.id}`)}
                        >
                          View member
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((m) => (
              <Card
                key={m.id}
                className="cursor-pointer hover:border-border-hover transition-colors"
                onClick={() => router.push(`/dashboard/members/${m.id}`)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <Avatar src={m.avatar_url} name={m.name} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text truncate">{m.name}</p>
                      {m.company_name && (
                        <p className="text-[11px] text-text-dim truncate">
                          <Building2 size={10} className="inline mr-1" />
                          {m.company_name}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {FLAG_ORDER.filter((f) => m.flags.includes(f)).map((f) => (
                          <Badge key={f} variant={FLAG_META[f].variant}>
                            {FLAG_META[f].label}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-text-dim">
                        <span>
                          Churn{' '}
                          <span className={cn('font-semibold', scoreTone(m.churn_risk_score, false))}>
                            {m.churn_risk_score}
                          </span>
                        </span>
                        <span>
                          Engage{' '}
                          <span className={cn('font-semibold', scoreTone(m.engagement_score, true))}>
                            {m.engagement_score}
                          </span>
                        </span>
                        <span>
                          Upgrade{' '}
                          <span className={cn('font-semibold', scoreTone(m.upgrade_potential, true))}>
                            {m.upgrade_potential}
                          </span>
                        </span>
                      </div>
                      {m.reasons[0] && (
                        <p className="mt-1.5 text-xs text-text-muted line-clamp-2">
                          {m.reasons[0]}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
