'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { useProgress } from '@/components/admin/TopProgressBar'
import { formatDateTime, formatDate, cn } from '@/lib/utils'
import { toast } from '@/lib/hooks/use-toast'
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
  MapPin,
  User,
  Globe,
  Instagram,
  Youtube,
  Music2,
  AtSign,
  TrendingUp,
  Users,
  Heart,
  Quote,
  Trash2,
  CreditCard,
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

const TIER_LABEL: Record<string, string> = {
  individual: 'Individual',
  business: 'Business',
  corporate: 'Corporate',
}

export function ApplicationsListPage() {
  const progress = useProgress()
  const confirm = useConfirm()
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
      toast({
        title: 'Failed to load applications',
        description: error.message,
        variant: 'destructive',
      })
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
        (a.industry ?? '').toLowerCase().includes(term) ||
        (a.city ?? '').toLowerCase().includes(term)
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

  // ── Action handlers ────────────────────────────────────────────────

  async function updateStatus(
    application: ApplicationRow,
    next: ApplicationStatus,
    notes?: string,
  ) {
    // Approval is special — it calls the server route that provisions the
    // auth user + profile + members row, then emails an invitation. Notes
    // are persisted first so they survive even if the approval API errors.
    if (next === 'approved') {
      if (notes !== undefined && notes !== application.notes) {
        await supabase
          .from('membership_applications')
          .update({ notes })
          .eq('id', application.id)
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
      const patch = {
        status: 'approved' as const,
        reviewed_at: new Date().toISOString(),
        notes: notes ?? application.notes,
      }
      setApps((prev) =>
        prev.map((a) => (a.id === application.id ? { ...a, ...patch } : a)),
      )
      setSelected((prev) => (prev?.id === application.id ? { ...prev, ...patch } : prev))
      toast({
        title: 'Member created',
        description: json.invite_sent
          ? `${application.first_name} ${application.last_name} added at ${json.tier.replace('_', ' ')} — invitation email sent.`
          : `${application.first_name} ${application.last_name} added at ${json.tier.replace('_', ' ')}.`,
      })
      return true
    }

    // Plain status update path
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const patch: Partial<ApplicationRow> = {
      status: next,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }
    if (notes !== undefined) patch.notes = notes
    const { error } = await supabase
      .from('membership_applications')
      .update(patch)
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

  async function deleteApplication(application: ApplicationRow) {
    const ok = await confirm({
      title: `Delete "${application.first_name} ${application.last_name}"?`,
      description: (
        <span>
          The application row will be permanently removed.{' '}
          {application.status === 'approved' && (
            <strong className="text-text">
              This applicant has already been provisioned as a member — the member account itself
              will <em>not</em> be deleted (handle that from Members).
            </strong>
          )}{' '}
          This cannot be undone.
        </span>
      ),
      confirmLabel: 'Delete application',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase
      .from('membership_applications')
      .delete()
      .eq('id', application.id)
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' })
      return
    }
    setApps((prev) => prev.filter((a) => a.id !== application.id))
    setSelected((prev) => (prev?.id === application.id ? null : prev))
    toast({
      title: 'Application deleted',
      description: `${application.first_name} ${application.last_name}`,
    })
  }

  if (loading) {
    return (
      <div className="p-4 md:p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading applications…
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <AdminPageHeader
        title="Membership applications"
        description="Prospective members who've submitted the public application form. Review their full profile — every field they filled in on the widget is captured here — then shortlist, reject, or approve. Approving provisions the auth account, sends an invitation email, and adds them to Members."
        meta={
          <span className="text-xs text-text-dim">
            {counts.total} total · {counts.pending} pending · {counts.shortlisted} shortlisted ·{' '}
            {counts.approved} approved
          </span>
        }
      />

      {/* Stats — 2-up on mobile, 4-up on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6">
        <StatTile
          label="Pending"
          value={counts.pending}
          icon={<ClipboardList size={14} />}
          tone={counts.pending > 0 ? 'warn' : 'neutral'}
        />
        <StatTile label="Shortlisted" value={counts.shortlisted} icon={<Tag size={14} />} tone="success" />
        <StatTile label="Approved" value={counts.approved} icon={<CheckCircle2 size={14} />} tone="success" />
        <StatTile label="Rejected" value={counts.rejected} icon={<XCircle size={14} />} />
      </div>

      {/* Filters — search + status chips. Stack vertically on mobile. */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="relative flex-1 md:max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, company, industry, city…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
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
              {filtered.map((a) => (
                <ApplicantRow key={a.id} application={a} onOpen={() => setSelected(a)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ApplicationDetailModal
        application={selected}
        onClose={() => setSelected(null)}
        onAction={updateStatus}
        onDelete={deleteApplication}
      />
    </div>
  )
}

// ─── Applicant row — used in the list. Photo, name, key chips, status ──

function ApplicantRow({
  application: a,
  onOpen,
}: {
  application: ApplicationRow
  onOpen: () => void
}) {
  const status = (a.status ?? 'pending') as ApplicationStatus
  const initials = ((a.first_name?.[0] ?? '?') + (a.last_name?.[0] ?? '')).toUpperCase()
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left flex items-start gap-3 sm:items-center sm:gap-4 px-4 sm:px-5 py-4 hover:bg-surface-2 transition-colors"
    >
      {/* Photo / initials */}
      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full overflow-hidden bg-gold/15 ring-1 ring-gold/20 flex items-center justify-center flex-shrink-0">
        {a.photo_url ? (
          <Image
            src={a.photo_url}
            alt={`${a.first_name} ${a.last_name}`}
            width={48}
            height={48}
            className="w-full h-full object-cover"
            unoptimized
          />
        ) : (
          <span className="font-[family-name:var(--font-heading)] text-sm font-semibold text-gold-dark uppercase">
            {initials}
          </span>
        )}
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text truncate">
              {a.first_name} {a.last_name}
              {a.position && (
                <span className="ml-2 text-xs text-text-dim font-normal">{a.position}</span>
              )}
            </p>
            <div className="flex items-center gap-x-3 gap-y-1 mt-0.5 flex-wrap">
              <span className="inline-flex items-center gap-1 text-[11px] text-text-dim">
                <Mail size={10} className="flex-shrink-0" />
                <span className="truncate max-w-[200px]">{a.email}</span>
              </span>
              {a.company && (
                <span className="inline-flex items-center gap-1 text-[11px] text-text-dim">
                  <Building2 size={10} className="flex-shrink-0" />
                  <span className="truncate max-w-[180px]">{a.company}</span>
                </span>
              )}
              {a.city && (
                <span className="inline-flex items-center gap-1 text-[11px] text-text-dim">
                  <MapPin size={10} className="flex-shrink-0" />
                  {a.city}
                </span>
              )}
            </div>
          </div>
          {/* Right column — date + status. Wraps under name on narrow. */}
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0 sm:flex-row sm:items-center sm:gap-3">
            <span className="text-[11px] text-text-dim whitespace-nowrap hidden sm:inline">
              {formatDate(a.created_at)}
            </span>
            <Badge variant={statusBadge[status]} dot>
              {status}
            </Badge>
          </div>
        </div>

        {/* Bottom row — tier + cadence + interests count */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {a.preferred_tier && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-gold-dark bg-gold-muted px-2 py-0.5 rounded-full">
              {TIER_LABEL[a.preferred_tier] ?? a.preferred_tier}
            </span>
          )}
          {a.payment_preference && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">
              {a.payment_preference}
            </span>
          )}
          {a.preferred_location && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted bg-surface-2 px-2 py-0.5 rounded-full">
              {a.preferred_location}
            </span>
          )}
          {a.interests && a.interests.length > 0 && (
            <span className="text-[10px] text-text-dim">
              {a.interests.length} interest{a.interests.length === 1 ? '' : 's'}
            </span>
          )}
          {/* Mobile-only date — desktop version is in the right column above */}
          <span className="text-[10px] text-text-dim sm:hidden ml-auto">
            {formatDate(a.created_at)}
          </span>
        </div>
      </div>
    </button>
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

// ─── Detail modal — every field from the widget, organized ────────────

function ApplicationDetailModal({
  application,
  onClose,
  onAction,
  onDelete,
}: {
  application: ApplicationRow | null
  onClose: () => void
  onAction: (a: ApplicationRow, status: ApplicationStatus, notes?: string) => Promise<boolean>
  onDelete: (a: ApplicationRow) => Promise<void>
}) {
  const confirm = useConfirm()
  const [notes, setNotes] = useState(application?.notes ?? '')
  const [pending, setPending] = useState<ApplicationStatus | null>(null)

  useEffect(() => {
    setNotes(application?.notes ?? '')
  }, [application])

  if (!application) return null
  const a = application
  const status = (a.status ?? 'pending') as ApplicationStatus
  const fullName = `${a.first_name} ${a.last_name}`.trim()
  const initials = ((a.first_name?.[0] ?? '?') + (a.last_name?.[0] ?? '')).toUpperCase()

  async function handleAction(next: ApplicationStatus) {
    // Approve is the one action with side-effects that can't be undone
    // (an auth user is created + an email is sent). Always confirm first
    // so the admin sees exactly what's about to happen.
    if (next === 'approved') {
      const ok = await confirm({
        title: `Approve ${fullName}?`,
        description: (
          <span>
            {status === 'approved' ? 'Re-approving will:' : 'Approving will:'}
            <ul className="mt-3 space-y-1.5 text-text-muted list-disc list-inside">
              <li>
                Create an auth account for{' '}
                <span className="font-medium text-text">{a.email}</span>
              </li>
              <li>
                Add them to <span className="font-medium text-text">Members</span> at the{' '}
                <span className="font-medium text-text">
                  {TIER_LABEL[a.preferred_tier ?? ''] ?? 'starter'}
                </span>{' '}
                tier
              </li>
              <li>
                Email them a <span className="font-medium text-text">branded invitation</span> with a
                link to set their password and enter the portal
              </li>
              <li>Carry their photo and website over to their member profile</li>
            </ul>
          </span>
        ),
        confirmLabel: status === 'approved' ? 'Re-provision & re-send' : 'Approve & send invite',
        tone: 'warning',
      })
      if (!ok) return
    }
    if (next === 'rejected') {
      const ok = await confirm({
        title: `Reject ${fullName}?`,
        description: (
          <span>
            The application status will be set to <strong className="text-text">rejected</strong>.
            No email is sent automatically — if you want to write back personally, use the “Email
            applicant” link below. You can still re-open the application later by changing the
            status.
          </span>
        ),
        confirmLabel: 'Reject application',
        tone: 'danger',
      })
      if (!ok) return
    }
    setPending(next)
    await onAction(a, next, notes)
    setPending(null)
  }

  // Quick visual summary of what each action does — admins shouldn't
  // have to remember whether "Approve" sends an email or just flips
  // a flag. The block sits right above the action footer so it's read
  // immediately before they click.
  const actionHint =
    status === 'approved'
      ? 'This applicant is already provisioned as a member. Re-approving will refresh their tier and re-send the password-set email.'
      : 'Approving provisions an auth account, adds them to Members, and emails them a branded link to set their password and enter the portal. Shortlisting & rejecting are silent — no email is sent.'

  // Build the address line from the parts the applicant filled in. Hide
  // entirely if none were captured.
  const addressLine = [
    a.address_line_1,
    a.address_line_2,
    a.city,
    a.postcode,
  ]
    .filter(Boolean)
    .join(', ')

  // Social URLs as an ordered list so we can render only the ones that
  // were actually filled in.
  const socials: { icon: React.ReactNode; label: string; url: string | null }[] = [
    { icon: <Linkedin size={13} />, label: 'LinkedIn', url: a.linkedin_url },
    { icon: <Instagram size={13} />, label: 'Instagram', url: a.instagram_url },
    { icon: <AtSign size={13} />, label: 'X', url: a.x_url },
    { icon: <Youtube size={13} />, label: 'YouTube', url: a.youtube_url },
    { icon: <Music2 size={13} />, label: 'TikTok', url: a.tiktok_url },
    { icon: <Globe size={13} />, label: 'Website', url: a.website_url },
  ]
  const activeSocials = socials.filter((s) => s.url)

  return (
    <Modal open={!!application} onClose={onClose} title={fullName} size="xl">
      <div className="space-y-7">
        {/* ── Header strip — photo + name + status + headline meta ──
           Bronze ring around the avatar, capacity row of meta beneath
           that reads as a single tagline rather than scattered chips. */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-5 -mt-2 pb-6 border-b border-border/70">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-bronze/15 ring-1 ring-bronze/40 flex items-center justify-center flex-shrink-0">
            {a.photo_url ? (
              <Image
                src={a.photo_url}
                alt={fullName}
                width={112}
                height={112}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              <span className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-bronze-light uppercase">
                {initials}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 space-y-2">
                {(a.position || a.company) && (
                  <p className="text-sm text-text">
                    {a.position}
                    {a.position && a.company && <span className="text-text-dim"> at </span>}
                    {a.company && <span className="text-text">{a.company}</span>}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {a.preferred_tier && (
                    <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-[0.18em] text-bronze-light bg-bronze/12 border border-bronze/30 px-2.5 py-1 rounded-full">
                      {TIER_LABEL[a.preferred_tier] ?? a.preferred_tier}
                    </span>
                  )}
                  {a.payment_preference && (
                    <span className="inline-flex items-center text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted bg-surface-2 border border-border px-2.5 py-1 rounded-full">
                      Paid {a.payment_preference}
                    </span>
                  )}
                  {a.preferred_location && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted bg-surface-2 border border-border px-2.5 py-1 rounded-full">
                      <MapPin size={10} />
                      {a.preferred_location}
                    </span>
                  )}
                </div>
              </div>
              <Badge variant={statusBadge[status]} dot>
                {status}
              </Badge>
            </div>
            <p className="mt-4 text-[11px] text-text-dim">
              Submitted {formatDateTime(a.created_at)}
              {a.reviewed_at && (
                <>
                  {' · '}
                  Last reviewed {formatDateTime(a.reviewed_at)}
                </>
              )}
            </p>
          </div>
        </div>

        {/* ── Contact ─────────────────────────────────────────────── */}
        <Section title="Contact" icon={<User size={11} />}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
            <DetailRow
              icon={<Mail size={13} />}
              label="Email"
              value={a.email}
              link={`mailto:${a.email}`}
            />
            {a.phone && (
              <DetailRow
                icon={<Phone size={13} />}
                label="Phone"
                value={a.phone}
                link={`tel:${a.phone.replace(/\s/g, '')}`}
              />
            )}
            {addressLine && (
              <DetailRow
                icon={<MapPin size={13} />}
                label="Address"
                value={addressLine}
                className="sm:col-span-2"
              />
            )}
            {a.preferred_location && (
              <DetailRow
                icon={<MapPin size={13} />}
                label="Preferred location"
                value={a.preferred_location}
              />
            )}
          </div>
        </Section>

        {/* ── Identity ────────────────────────────────────────────── */}
        {(a.nationality || a.identifies_as || a.pronouns) && (
          <Section title="Identity" icon={<User size={11} />}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5">
              {a.nationality && <DetailRow label="Nationality" value={a.nationality} />}
              {a.identifies_as && <DetailRow label="Identifies as" value={a.identifies_as} />}
              {a.pronouns && <DetailRow label="Pronouns" value={a.pronouns} />}
            </div>
          </Section>
        )}

        {/* ── Bio + Interests ─────────────────────────────────────── */}
        {(a.bio || (a.interests && a.interests.length > 0)) && (
          <Section title="Profile" icon={<Quote size={11} />}>
            {a.bio && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-dim mb-2">
                  About them
                </p>
                <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">{a.bio}</p>
              </div>
            )}
            {a.interests && a.interests.length > 0 && (
              <div className={a.bio ? 'mt-5' : ''}>
                <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-dim mb-2">
                  Events they're keen on
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {a.interests.map((int) => (
                    <span
                      key={int}
                      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-gold-muted text-gold-dark border border-border-gold"
                    >
                      <Heart size={10} className="flex-shrink-0" />
                      {int}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* ── Business ────────────────────────────────────────────── */}
        {(a.company ||
          a.industry ||
          a.position ||
          a.work_email ||
          a.annual_turnover ||
          a.employees) && (
          <Section title="Business" icon={<Building2 size={11} />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              {a.company && (
                <DetailRow icon={<Building2 size={13} />} label="Company" value={a.company} />
              )}
              {a.industry && <DetailRow label="Industry" value={a.industry} />}
              {a.position && <DetailRow label="Role" value={a.position} />}
              {a.work_email && (
                <DetailRow
                  icon={<Mail size={13} />}
                  label="Work email"
                  value={a.work_email}
                  link={`mailto:${a.work_email}`}
                />
              )}
              {a.annual_turnover && (
                <DetailRow
                  icon={<TrendingUp size={13} />}
                  label="Annual turnover"
                  value={a.annual_turnover}
                />
              )}
              {a.employees && (
                <DetailRow icon={<Users size={13} />} label="Employees" value={a.employees} />
              )}
            </div>
          </Section>
        )}

        {/* ── Online presence ─────────────────────────────────────── */}
        {activeSocials.length > 0 && (
          <Section title="Online presence" icon={<Globe size={11} />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              {activeSocials.map((s) => (
                <DetailRow
                  key={s.label}
                  icon={s.icon}
                  label={s.label}
                  value={s.url!}
                  link={s.url!}
                />
              ))}
            </div>
          </Section>
        )}

        {/* ── Membership preference ───────────────────────────────── */}
        {(a.preferred_tier || a.payment_preference) && (
          <Section title="Membership preference" icon={<CreditCard size={11} />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              {a.preferred_tier && (
                <DetailRow
                  icon={<Tag size={13} />}
                  label="Tier"
                  value={TIER_LABEL[a.preferred_tier] ?? a.preferred_tier}
                />
              )}
              {a.payment_preference && (
                <DetailRow
                  icon={<CreditCard size={13} />}
                  label="Payment cadence"
                  value={a.payment_preference}
                />
              )}
            </div>
          </Section>
        )}

        {/* ── Referral ────────────────────────────────────────────── */}
        {(a.referral_source || a.referral_name) && (
          <Section title="How they heard" icon={<Heart size={11} />}>
            <p className="text-sm text-text-muted">
              {a.referral_source ?? '—'}
              {a.referral_name && (
                <span className="text-text-dim"> · via {a.referral_name}</span>
              )}
            </p>
          </Section>
        )}

        {/* ── Internal notes ──────────────────────────────────────── */}
        <Section title="Internal notes" icon={<ClipboardList size={11} />}>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="e.g. spoke with applicant on phone, recommending tier 2…"
            hint="Visible only to admins. Saved when you click an action button below."
          />
        </Section>

        {/* Inline hint explaining what the action buttons will do — keeps
           admins from approving someone before they've read the file. */}
        <div className="pt-4 border-t border-border -mx-6 px-6 mt-6">
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3 flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-bronze/15 text-bronze-light flex-shrink-0 mt-0.5">
              <Mail size={11} strokeWidth={1.8} />
            </span>
            <p className="text-[12.5px] text-text-muted leading-relaxed">{actionHint}</p>
          </div>
        </div>

        {/* ── Actions ─────────────────────────────────────────────── */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 -mx-6 px-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
              Close
            </Button>
            <Button
              variant="ghost"
              onClick={() => onDelete(a)}
              className="text-accent-warm flex-1 sm:flex-none"
            >
              <Trash2 size={14} />
              Delete
            </Button>
          </div>
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
            <Button onClick={() => handleAction('approved')} loading={pending === 'approved'}>
              <CheckCircle2 size={14} />
              {status === 'approved' ? 'Re-provision member' : 'Approve & create member'}
            </Button>
            {a.email && (
              <a
                href={`mailto:${a.email}`}
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

// ─── Section + DetailRow primitives ───────────────────────────────────

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="pt-6 border-t border-border/70 first:border-t-0 first:pt-0">
      <p className="font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.28em] text-bronze-light mb-4 inline-flex items-center gap-2">
        {icon && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-bronze/12 text-bronze-light">
            {icon}
          </span>
        )}
        {title}
      </p>
      {children}
    </div>
  )
}

function DetailRow({
  icon,
  label,
  value,
  link,
  className,
}: {
  icon?: React.ReactNode
  label: string
  value: string | null
  link?: string
  className?: string
}) {
  if (!value) return null
  return (
    <div className={cn('min-w-0', className)}>
      {/* Label + icon — fixed mb so the value gets a real gap. The icon
         sits in a small bronze-tinted circle to its left, never inline
         next to the value (that's what was making PHONE03045… read as
         one glued word). */}
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon && (
          <span className="inline-flex items-center justify-center w-4 h-4 text-slate-haze">
            {icon}
          </span>
        )}
        <p className="font-[family-name:var(--font-label)] text-[9.5px] font-medium uppercase tracking-[0.22em] text-text-dim">
          {label}
        </p>
      </div>
      {link ? (
        <a
          href={link}
          target={link.startsWith('http') ? '_blank' : undefined}
          rel="noopener noreferrer"
          className="block text-[14px] font-medium text-text hover:text-bronze-light transition-colors break-words leading-snug"
        >
          {value}
        </a>
      ) : (
        <p className="text-[14px] font-medium text-text break-words leading-snug">{value}</p>
      )}
    </div>
  )
}
