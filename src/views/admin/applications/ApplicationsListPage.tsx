'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { formatDateTime, formatDate, cn } from '@/lib/utils'
import { toast } from '@/lib/hooks/use-toast'
import { useProgress } from '@/components/admin/TopProgressBar'
import {
  ClipboardList,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Building2,
  Mail,
  Phone,
  Linkedin,
  Tag,
  Calendar,
  MapPin,
} from 'lucide-react'
import type { Database } from '@/types/database'

type ApplicationRow = Database['public']['Tables']['membership_applications']['Row']
type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'shortlisted'

const STATUS_OPTIONS: { value: ApplicationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]

const statusBadge: Record<ApplicationStatus, 'active' | 'upcoming' | 'urgent' | 'draft'> = {
  pending: 'upcoming',
  shortlisted: 'active',
  approved: 'active',
  rejected: 'urgent',
}

export function ApplicationsListPage() {
  const progress = useProgress()
  const [apps, setApps] = useState<ApplicationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'all'>('pending')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ApplicationRow | null>(null)

  useEffect(() => {
    fetchApps()
  }, [])

  async function fetchApps() {
    setLoading(true)
    const { data, error } = await supabase
      .from('membership_applications')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      toast({ title: 'Failed to load applications', description: error.message, variant: 'destructive' })
    } else if (data) {
      setApps(data as ApplicationRow[])
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return apps.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false
      if (!term) return true
      const name = `${a.first_name ?? ''} ${a.last_name ?? ''}`.toLowerCase()
      return (
        name.includes(term) ||
        (a.email ?? '').toLowerCase().includes(term) ||
        (a.company ?? '').toLowerCase().includes(term) ||
        (a.industry ?? '').toLowerCase().includes(term)
      )
    })
  }, [apps, statusFilter, search])

  const counts = useMemo(
    () => ({
      total: apps.length,
      pending: apps.filter((a) => a.status === 'pending').length,
      shortlisted: apps.filter((a) => a.status === 'shortlisted').length,
      approved: apps.filter((a) => a.status === 'approved').length,
      rejected: apps.filter((a) => a.status === 'rejected').length,
    }),
    [apps],
  )

  async function updateStatus(application: ApplicationRow, next: ApplicationStatus, notes?: string) {
    // Approval is a special case — we don't just flip a status flag, we
    // also provision the auth user + profile + members row via the server
    // route. Everything else is a plain status update.
    if (next === 'approved') {
      // Persist the notes first (so they don't get lost if approve fails).
      if (notes !== undefined && notes !== application.notes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase.from('membership_applications').update({ notes } as any).eq('id', application.id)
      }
      const res = await progress.track(
        fetch('/api/admin/applications/approve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ application_id: application.id }),
        }),
      )
      const json = await res.json()
      if (!res.ok) {
        toast({
          title: 'Approval failed',
          description: json.error || 'Unknown error',
          variant: 'destructive',
        })
        return false
      }
      // Mirror server state locally so the modal updates without a refetch.
      setApps((prev) =>
        prev.map((a) =>
          a.id === application.id
            ? { ...a, status: 'approved', reviewed_at: new Date().toISOString(), notes: notes ?? a.notes }
            : a,
        ),
      )
      setSelected((prev) =>
        prev?.id === application.id
          ? { ...prev, status: 'approved', reviewed_at: new Date().toISOString(), notes: notes ?? prev.notes }
          : prev,
      )
      toast({
        title: 'Member created',
        description: json.invite_sent
          ? `${application.first_name} ${application.last_name} added at ${json.tier.replace('_', ' ')} — invitation email sent.`
          : `${application.first_name} ${application.last_name} added at ${json.tier.replace('_', ' ')}.`,
      })
      return true
    }

    // Plain status update path (reject / shortlist / etc.).
    const { data: { user } } = await supabase.auth.getUser()
    const patch: Partial<ApplicationRow> = {
      status: next,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }
    if (notes !== undefined) patch.notes = notes
    const { error } = await supabase
      .from('membership_applications')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq('id', application.id)
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' })
      return false
    }
    setApps((prev) => prev.map((a) => (a.id === application.id ? { ...a, ...patch } : a)))
    setSelected((prev) => (prev?.id === application.id ? { ...prev, ...patch } : prev))
    toast({
      title:
        next === 'rejected'
          ? 'Application rejected'
          : next === 'shortlisted'
            ? 'Marked as shortlisted'
            : 'Status updated',
      description: `${application.first_name} ${application.last_name}`,
    })
    return true
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading applications…
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl">
      <AdminPageHeader
        title="Membership applications"
        description="Prospective members who've submitted the public application form. Review their details, shortlist, or approve — approving an application provisions the auth account, sends an invitation email so they can set their password, and adds them to Members automatically."
        meta={
          <span className="text-xs text-text-dim">
            {counts.total} total · {counts.pending} pending · {counts.approved} approved
          </span>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatTile label="Pending" value={counts.pending} icon={<ClipboardList size={14} />} tone={counts.pending > 0 ? 'warn' : 'neutral'} />
        <StatTile label="Shortlisted" value={counts.shortlisted} icon={<Tag size={14} />} tone="success" />
        <StatTile label="Approved" value={counts.approved} icon={<CheckCircle2 size={14} />} tone="success" />
        <StatTile label="Rejected" value={counts.rejected} icon={<XCircle size={14} />} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, company, industry…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_OPTIONS.map((opt) => {
            const count =
              opt.value === 'all'
                ? apps.length
                : apps.filter((a) => a.status === opt.value).length
            return (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-full border transition-colors',
                  statusFilter === opt.value
                    ? 'bg-gold text-white border-gold'
                    : 'bg-white text-text-muted border-border hover:border-border-hover',
                )}
              >
                {opt.label}
                <span className="ml-1.5 opacity-70">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <AdminEmptyState
              icon={ClipboardList}
              title={apps.length === 0 ? 'No applications yet' : 'No matches'}
              description={
                apps.length === 0
                  ? 'Applications submitted via the public membership form appear here.'
                  : 'Try a different filter or clear your search.'
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((a) => {
                const status = (a.status ?? 'pending') as ApplicationStatus
                const initials =
                  ((a.first_name?.[0] ?? '?') + (a.last_name?.[0] ?? '')).toUpperCase()
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelected(a)}
                    className="w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-surface-2 transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-full bg-gold/15 ring-1 ring-gold/20 flex items-center justify-center flex-shrink-0">
                      <span className="font-[family-name:var(--font-heading)] text-sm font-semibold text-gold-dark uppercase">
                        {initials}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">
                        {a.first_name} {a.last_name}
                      </p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[11px] text-text-dim">
                          <Mail size={10} />
                          {a.email}
                        </span>
                        {a.company && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-text-dim">
                            <Building2 size={10} />
                            {a.company}
                          </span>
                        )}
                        {a.preferred_tier && (
                          <span className="text-[10px] font-medium uppercase tracking-wider text-gold-dark bg-gold-muted px-1.5 py-0.5 rounded-full">
                            {a.preferred_tier}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] text-text-dim whitespace-nowrap">
                      {formatDate(a.created_at)}
                    </span>
                    <Badge variant={statusBadge[status]} dot>
                      {status}
                    </Badge>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail modal */}
      <ApplicationDetailModal
        application={selected}
        onClose={() => setSelected(null)}
        onAction={updateStatus}
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
      <CardContent className="p-5">
        <div className="flex items-center gap-1.5">
          <span className={toneClass}>{icon}</span>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
            {label}
          </p>
        </div>
        <p className="font-[family-name:var(--font-heading)] text-2xl md:text-3xl font-semibold text-text mt-2">
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

function ApplicationDetailModal({
  application,
  onClose,
  onAction,
}: {
  application: ApplicationRow | null
  onClose: () => void
  onAction: (a: ApplicationRow, status: ApplicationStatus, notes?: string) => Promise<boolean>
}) {
  const [notes, setNotes] = useState(application?.notes ?? '')
  const [pending, setPending] = useState<ApplicationStatus | null>(null)

  useEffect(() => {
    setNotes(application?.notes ?? '')
  }, [application])

  if (!application) return null
  const status = (application.status ?? 'pending') as ApplicationStatus

  async function handleAction(next: ApplicationStatus) {
    setPending(next)
    await onAction(application!, next, notes)
    setPending(null)
  }

  return (
    <Modal
      open={!!application}
      onClose={onClose}
      title={`${application.first_name} ${application.last_name}`}
      size="lg"
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Badge variant={statusBadge[status]} dot>
            {status}
          </Badge>
          <span className="text-[11px] text-text-dim">
            Submitted {formatDateTime(application.created_at)}
          </span>
        </div>

        {/* Contact details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
          <DetailRow icon={<Mail size={13} />} label="Email" value={application.email} link={`mailto:${application.email}`} />
          {application.phone && (
            <DetailRow icon={<Phone size={13} />} label="Phone" value={application.phone} link={`tel:${application.phone}`} />
          )}
          {application.company && (
            <DetailRow icon={<Building2 size={13} />} label="Company" value={application.company} />
          )}
          {application.position && <DetailRow label="Role" value={application.position} />}
          {application.industry && <DetailRow label="Industry" value={application.industry} />}
          {application.linkedin_url && (
            <DetailRow
              icon={<Linkedin size={13} />}
              label="LinkedIn"
              value={application.linkedin_url}
              link={application.linkedin_url}
            />
          )}
          {application.preferred_tier && (
            <DetailRow icon={<Tag size={13} />} label="Preferred tier" value={application.preferred_tier} />
          )}
          {application.preferred_location && (
            <DetailRow icon={<MapPin size={13} />} label="Preferred location" value={application.preferred_location} />
          )}
        </div>

        {/* Bio + interests */}
        {(application.bio || (application.interests && application.interests.length > 0)) && (
          <div className="pt-3 border-t border-border space-y-3">
            {application.bio && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-dim mb-1.5">
                  About them
                </p>
                <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{application.bio}</p>
              </div>
            )}
            {application.interests && application.interests.length > 0 && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-dim mb-1.5">
                  Interests
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {application.interests.map((int) => (
                    <span
                      key={int}
                      className="text-[11px] font-medium px-2 py-1 rounded-full bg-surface-2 text-text-muted border border-border"
                    >
                      {int}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Referral */}
        {(application.referral_source || application.referral_name) && (
          <div className="pt-3 border-t border-border">
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-dim mb-1.5">
              <Calendar size={11} className="inline mr-1" />
              How they heard
            </p>
            <p className="text-sm text-text-muted">
              {application.referral_source ?? '—'}
              {application.referral_name && (
                <span className="text-text-dim"> · via {application.referral_name}</span>
              )}
            </p>
          </div>
        )}

        {/* Notes — admin-only */}
        <div className="pt-3 border-t border-border">
          <Textarea
            label="Internal notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. spoke with applicant on phone, recommending tier 2…"
            hint="Visible only to admins. Saved when you click an action button below."
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border -mx-6 px-6 mt-5">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <div className="flex gap-2 flex-wrap justify-end">
            {status !== 'rejected' && (
              <Button
                variant="ghost"
                onClick={() => handleAction('rejected')}
                loading={pending === 'rejected'}
                className="text-accent-warm"
              >
                <XCircle size={14} />
                Reject
              </Button>
            )}
            {status !== 'shortlisted' && status !== 'approved' && (
              <Button
                variant="secondary"
                onClick={() => handleAction('shortlisted')}
                loading={pending === 'shortlisted'}
              >
                <Tag size={14} />
                Shortlist
              </Button>
            )}
            <Button
              onClick={() => handleAction('approved')}
              loading={pending === 'approved'}
            >
              <CheckCircle2 size={14} />
              {status === 'approved' ? 'Re-provision member' : 'Approve & create member'}
            </Button>
            {application.email && (
              <a
                href={`mailto:${application.email}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-gold transition-colors"
              >
                Email applicant
                <ExternalLink size={11} />
              </a>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}

function DetailRow({
  icon,
  label,
  value,
  link,
}: {
  icon?: React.ReactNode
  label: string
  value: string | null
  link?: string
}) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-dim mb-1 inline-flex items-center gap-1">
        {icon}
        {label}
      </p>
      {link ? (
        <a
          href={link}
          target={link.startsWith('http') ? '_blank' : undefined}
          rel="noopener noreferrer"
          className="text-sm text-text hover:text-gold transition-colors break-words"
        >
          {value}
        </a>
      ) : (
        <p className="text-sm text-text break-words">{value}</p>
      )}
    </div>
  )
}
