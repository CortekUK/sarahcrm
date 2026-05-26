'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '@/providers/ThemeProvider'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
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
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate, cn } from '@/lib/utils'
import {
  Plus,
  Search,
  Users,
  UserCheck,
  Clock,
  XCircle,
  MoreVertical,
  Eye,
  Ban,
  Trash2,
  Mail,
  Building2,
} from 'lucide-react'
import { AddMemberModal } from './AddMemberModal'
import type { Database } from '@/types/database'

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
    job_title: string | null
  }
}

const STATUS_OPTIONS: { value: MemberStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]

const TIER_OPTIONS: { value: MemberTier | 'all'; label: string }[] = [
  { value: 'all', label: 'All Tiers' },
  { value: 'tier_1', label: 'Tier 1' },
  { value: 'tier_2', label: 'Tier 2' },
  { value: 'tier_3', label: 'Tier 3' },
]

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

export function MembersListPage() {
  const router = useRouter()
  const confirm = useConfirm()
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<MemberTier | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<MemberStatus | 'all'>('all')
  const [showAddModal, setShowAddModal] = useState(false)

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('members')
      .select(
        'id, membership_tier, membership_status, intros_used_this_month, monthly_intro_quota, company_name, created_at, profiles(first_name, last_name, email, avatar_url, company_name, job_title)',
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) {
      toast({
        title: 'Failed to load members',
        description: error.message,
        variant: 'destructive',
      })
    } else if (data) {
      setMembers(data as unknown as MemberRow[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return members.filter((m) => {
      if (tierFilter !== 'all' && m.membership_tier !== tierFilter) return false
      if (statusFilter !== 'all' && m.membership_status !== statusFilter) return false
      if (!term) return true
      const name = `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.toLowerCase()
      const company = (m.company_name ?? m.profiles?.company_name ?? '').toLowerCase()
      const email = (m.profiles?.email ?? '').toLowerCase()
      const job = (m.profiles?.job_title ?? '').toLowerCase()
      return (
        name.includes(term) ||
        company.includes(term) ||
        email.includes(term) ||
        job.includes(term)
      )
    })
  }, [members, search, tierFilter, statusFilter])

  const counts = useMemo(
    () => ({
      total: members.length,
      active: members.filter((m) => m.membership_status === 'active').length,
      pending: members.filter((m) => m.membership_status === 'pending').length,
      cancelled: members.filter((m) => m.membership_status === 'cancelled').length,
    }),
    [members],
  )

  // ── Action handlers ────────────────────────────────────────────────

  async function handleCancel(m: MemberRow) {
    const name = `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim() || 'this member'
    const ok = await confirm({
      title: `Cancel ${name}'s membership?`,
      description: (
        <span>
          Their membership status will be set to <strong className="text-text">cancelled</strong>{' '}
          and their portal access will be revoked immediately. Any Stripe subscription will be
          cancelled at the end of the current billing period (they keep what they've already paid
          for). This can be undone by editing the member and changing the status back to active.
        </span>
      ),
      confirmLabel: 'Cancel membership',
      tone: 'danger',
    })
    if (!ok) return
    const res = await fetch('/api/admin/members/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member_id: m.id }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast({ title: 'Cancel failed', description: json.error, variant: 'destructive' })
      return
    }
    toast({
      title: 'Membership cancelled',
      description:
        json.stripe === 'cancelled'
          ? `${name} can no longer log into the portal. Stripe subscription set to end at period close.`
          : `${name} can no longer log into the portal.`,
    })
    fetchMembers()
  }

  async function handleDelete(m: MemberRow) {
    const name = `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim() || 'this member'
    const ok = await confirm({
      title: `Delete ${name}?`,
      description: (
        <span>
          The auth account, profile, members row, and all of their bookings + introductions will be
          permanently removed. Any active Stripe subscription will be cancelled immediately. This
          cannot be undone — if you only want to revoke portal access, use{' '}
          <strong className="text-text">Cancel</strong> instead.
        </span>
      ),
      confirmLabel: 'Delete permanently',
      tone: 'danger',
    })
    if (!ok) return
    const res = await fetch('/api/admin/members/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member_id: m.id }),
    })
    const json = await res.json()
    if (!res.ok) {
      toast({ title: 'Delete failed', description: json.error, variant: 'destructive' })
      return
    }
    toast({
      title: json.soft_deleted ? 'Member archived' : 'Member deleted',
      description: name,
    })
    fetchMembers()
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading members…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <AdminPageHeader
        title="Members"
        description="The active membership of The Club. Approved applications appear here automatically. Cancelling a member ends their portal access immediately — they keep their paid time on Stripe."
        meta={
          <span className="text-xs text-text-dim">
            {counts.total} total · {counts.active} active · {counts.pending} pending · {counts.cancelled} cancelled
          </span>
        }
        actions={
          <Button icon={<Plus size={16} />} onClick={() => setShowAddModal(true)}>
            Add member
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <StatTile label="Active" value={counts.active} icon={<UserCheck size={14} />} tone="success" />
        <StatTile label="Pending" value={counts.pending} icon={<Clock size={14} />} tone="warn" />
        <StatTile label="Cancelled" value={counts.cancelled} icon={<XCircle size={14} />} />
        <StatTile label="Total" value={counts.total} icon={<Users size={14} />} />
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="relative flex-1 md:max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, company, role…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {STATUS_OPTIONS.map((opt) => {
            const count =
              opt.value === 'all'
                ? members.length
                : members.filter((m) => m.membership_status === opt.value).length
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value as MemberStatus | 'all')}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap',
                  statusFilter === opt.value
                    ? 'bg-gold text-white border-gold'
                    : 'bg-[var(--color-surface)] text-text-muted border-border hover:border-border-hover hover:text-text',
                )}
              >
                {opt.label}
                <span className="ml-1.5 opacity-70">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
          {TIER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTierFilter(opt.value as MemberTier | 'all')}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap',
                tierFilter === opt.value
                  ? 'bg-gold text-white border-gold'
                  : 'bg-[var(--color-surface)] text-text-muted border-border hover:border-border-hover hover:text-text',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <AdminEmptyState
              icon={Users}
              title={members.length === 0 ? 'No members yet' : 'No matches'}
              description={
                members.length === 0
                  ? 'Approved membership applications will appear here. You can also add a member manually with the button above.'
                  : 'Try a different filter or clear your search.'
              }
              action={
                members.length === 0 ? (
                  <Button icon={<Plus size={16} />} onClick={() => setShowAddModal(true)}>
                    Add first member
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0 overflow-x-auto">
              <Table className="min-w-[900px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[280px]">Member</TableHead>
                    <TableHead className="w-[200px]">Company</TableHead>
                    <TableHead className="w-[100px]">Tier</TableHead>
                    <TableHead className="w-[110px]">Status</TableHead>
                    <TableHead className="w-[90px]">Intros</TableHead>
                    <TableHead className="w-[110px]">Joined</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => {
                    const name =
                      `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim()
                    const company = m.company_name ?? m.profiles?.company_name
                    return (
                      <TableRow
                        key={m.id}
                        className="cursor-pointer group"
                        onClick={() => router.push(`/dashboard/members/${m.id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar
                              src={m.profiles?.avatar_url}
                              name={name || m.profiles?.email || '?'}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="text-[13.5px] font-medium text-text leading-snug truncate">
                                {name || 'Unnamed'}
                              </p>
                              <p className="mt-0.5 text-[11px] text-text-dim truncate">
                                {m.profiles?.email}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-text-muted">
                          {company ? (
                            <div className="min-w-0">
                              <p className="text-xs truncate">{company}</p>
                              {m.profiles?.job_title && (
                                <p className="text-[11px] text-text-dim truncate">
                                  {m.profiles.job_title}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-text-dim">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="info">{tierLabels[m.membership_tier]}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant[m.membership_status]} dot>
                            {m.membership_status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          <span className="text-text">{m.intros_used_this_month}</span>
                          <span className="text-text-dim text-xs">
                            {' '}
                            / {m.monthly_intro_quota}
                          </span>
                        </TableCell>
                        <TableCell className="text-text-muted whitespace-nowrap text-xs">
                          {formatDate(m.created_at)}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <RowActions
                            isCancelled={m.membership_status === 'cancelled'}
                            onView={() => router.push(`/dashboard/members/${m.id}`)}
                            onCancel={() => handleCancel(m)}
                            onDelete={() => handleDelete(m)}
                            onEmail={
                              m.profiles?.email
                                ? () => {
                                    window.location.href = `mailto:${m.profiles.email}`
                                  }
                                : undefined
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((m) => {
              const name =
                `${m.profiles?.first_name ?? ''} ${m.profiles?.last_name ?? ''}`.trim()
              const company = m.company_name ?? m.profiles?.company_name
              return (
                <Card
                  key={m.id}
                  className="cursor-pointer hover:border-border-hover transition-colors"
                  onClick={() => router.push(`/dashboard/members/${m.id}`)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Avatar
                        src={m.profiles?.avatar_url}
                        name={name || m.profiles?.email || '?'}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-text truncate">
                              {name || 'Unnamed'}
                            </p>
                            <p className="text-[11px] text-text-dim truncate">
                              {m.profiles?.email}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Badge variant={statusVariant[m.membership_status]} dot>
                              {m.membership_status}
                            </Badge>
                            <div onClick={(e) => e.stopPropagation()}>
                              <RowActions
                                isCancelled={m.membership_status === 'cancelled'}
                                onView={() => router.push(`/dashboard/members/${m.id}`)}
                                onCancel={() => handleCancel(m)}
                                onDelete={() => handleDelete(m)}
                                onEmail={
                                  m.profiles?.email
                                    ? () => {
                                        window.location.href = `mailto:${m.profiles.email}`
                                      }
                                    : undefined
                                }
                                alwaysVisible
                              />
                            </div>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <Badge variant="info">{tierLabels[m.membership_tier]}</Badge>
                          <span className="text-[11px] text-text-dim">
                            {m.intros_used_this_month}/{m.monthly_intro_quota} intros
                          </span>
                        </div>
                        {company && (
                          <p className="mt-1.5 text-xs text-text-muted truncate">
                            <Building2 size={10} className="inline mr-1 text-text-dim" />
                            {company}
                            {m.profiles?.job_title && (
                              <span className="text-text-dim"> · {m.profiles.job_title}</span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

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

function StatTile({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: number
  icon: React.ReactNode
  tone?: 'neutral' | 'success' | 'warn'
}) {
  const toneClass = {
    neutral: 'text-text-muted',
    success: 'text-accent',
    warn: 'text-gold',
  }[tone]
  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="flex items-center gap-1.5">
          <span className={toneClass}>{icon}</span>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
            {label}
          </p>
        </div>
        <p className="font-[family-name:var(--font-heading)] text-xl md:text-2xl lg:text-3xl font-semibold text-text mt-2">
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

// ─── Row actions menu — view + email + cancel + delete ──────────────

function RowActions({
  isCancelled,
  onView,
  onCancel,
  onDelete,
  onEmail,
  alwaysVisible = false,
}: {
  isCancelled: boolean
  onView: () => void
  onCancel: () => void
  onDelete: () => void
  onEmail?: () => void
  alwaysVisible?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const { theme } = useTheme()

  // The table wrapper uses overflow-x-auto, which per CSS spec implicitly
  // clips overflow-y too. Rendering the menu in a portal with position:
  // fixed lets it escape that clipping context and sit above the next
  // section. We re-apply theme-night-admin on the portal root so the
  // dark token palette still resolves (the portal sits outside the
  // admin shell wrapper that normally provides it).
  function placeMenu() {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const menuW = 180
    const menuH = 180 // rough — used only to flip upward near the viewport bottom
    const spaceBelow = window.innerHeight - r.bottom
    const openUp = spaceBelow < menuH + 16
    setCoords({
      top: openUp ? r.top - menuH - 4 : r.bottom + 4,
      left: Math.max(8, r.right - menuW),
    })
  }

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (open) {
      setOpen(false)
      return
    }
    placeMenu()
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const handler = () => placeMenu()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open])

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={cn(
          'p-1.5 rounded hover:bg-surface-2 text-text-dim hover:text-text transition-colors',
          !alwaysVisible && 'opacity-0 group-hover:opacity-100',
          open && 'opacity-100',
        )}
        aria-label="Row actions"
      >
        <MoreVertical size={14} strokeWidth={1.8} />
      </button>
      {open && coords && typeof window !== 'undefined' &&
        createPortal(
          <div className={theme === 'night' ? 'theme-night-admin' : ''}>
            <div className="fixed inset-0 z-60" onClick={() => setOpen(false)} />
            <div
              className="fixed bg-surface border border-border rounded-md shadow-lg py-1 min-w-[170px] z-61"
              style={{ top: coords.top, left: coords.left }}
            >
            <ActionItem
              icon={<Eye size={12} />}
              label="View details"
              onClick={() => {
                setOpen(false)
                onView()
              }}
            />
            {onEmail && (
              <ActionItem
                icon={<Mail size={12} />}
                label="Email member"
                onClick={() => {
                  setOpen(false)
                  onEmail()
                }}
              />
            )}
            {!isCancelled && (
              <>
                <div className="my-1 h-px bg-border" />
                <ActionItem
                  icon={<Ban size={12} />}
                  label="Cancel membership"
                  className="text-accent-warm"
                  onClick={() => {
                    setOpen(false)
                    onCancel()
                  }}
                />
              </>
            )}
            <div className="my-1 h-px bg-border" />
            <ActionItem
              icon={<Trash2 size={12} />}
              label="Delete permanently"
              className="text-accent-warm"
              onClick={() => {
                setOpen(false)
                onDelete()
              }}
            />
          </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function ActionItem({
  icon,
  label,
  onClick,
  className,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        'w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 flex items-center gap-2 text-text',
        className,
      )}
    >
      {icon}
      {label}
    </button>
  )
}
