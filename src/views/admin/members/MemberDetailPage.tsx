'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Avatar } from '@/components/ui/Avatar'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import {
  ArrowLeft,
  Pencil,
  X,
  Save,
  CreditCard,
  Ban,
  Trash2,
  Mail,
  Phone,
  Linkedin,
  Instagram,
  Youtube,
  Music2,
  AtSign,
  Globe,
  MapPin,
  Heart,
  TrendingUp,
  Users as UsersIcon,
  Quote,
  Building2,
  User as UserIcon,
  Tag as TagIcon,
} from 'lucide-react'
import type { Database } from '@/types/database'

type Tag = Database['public']['Tables']['tags']['Row']
type MemberStatus = Database['public']['Enums']['membership_status']
type MemberTier = Database['public']['Enums']['membership_tier']
type IntroStatus = Database['public']['Enums']['intro_status']
type BookingStatus = Database['public']['Enums']['booking_status']
type PaymentStatus = Database['public']['Enums']['payment_status']
type ApplicationRow = Database['public']['Tables']['membership_applications']['Row']

interface MemberDetail {
  id: string
  profile_id: string
  membership_type: string
  membership_tier: MemberTier
  membership_status: MemberStatus
  monthly_intro_quota: number
  intros_used_this_month: number
  company_name: string | null
  company_description: string | null
  company_website: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  showcase_enabled: boolean
  sponsor_aligned: boolean
  membership_start_date: string | null
  membership_end_date: string | null
  renewal_date: string | null
  source: string | null
  notes: string | null
  created_at: string
  profiles: {
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
    avatar_url: string | null
    company_name: string | null
    job_title: string | null
    bio: string | null
    linkedin_url: string | null
    website_url: string | null
  }
}

interface IntroRow {
  id: string
  status: IntroStatus
  match_score: number | null
  match_reason: string | null
  created_at: string
  other_member: {
    profiles: {
      first_name: string | null
      last_name: string | null
      company_name: string | null
    }
  }
}

interface BookingRow {
  id: string
  status: BookingStatus
  amount_pence: number
  created_at: string
  events: { title: string; start_date: string; venue_name: string | null }
}

interface PaymentRow {
  id: string
  payment_type: string
  amount_pence: number
  status: PaymentStatus
  due_date: string | null
  paid_at: string | null
  description: string | null
}

const editSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  job_title: z.string().optional(),
  bio: z.string().optional(),
  linkedin_url: z.string().optional(),
  website_url: z.string().optional(),
  company_name: z.string().optional(),
  company_description: z.string().optional(),
  company_website: z.string().optional(),
  membership_type: z.enum(['individual', 'business']),
  membership_tier: z.enum(['tier_1', 'tier_2', 'tier_3']),
  membership_status: z.enum(['active', 'pending', 'expired', 'cancelled']),
  notes: z.string().optional(),
})
type EditFormData = z.infer<typeof editSchema>

const statusBadge: Record<MemberStatus, 'active' | 'upcoming' | 'draft' | 'urgent'> = {
  active: 'active',
  pending: 'upcoming',
  expired: 'draft',
  cancelled: 'urgent',
}
const introStatusBadge: Record<IntroStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  suggested: 'draft',
  approved: 'upcoming',
  sent: 'info',
  accepted: 'active',
  completed: 'active',
  declined: 'urgent',
}
const bookingStatusBadge: Record<BookingStatus, 'active' | 'upcoming' | 'draft' | 'urgent'> = {
  confirmed: 'active',
  pending: 'upcoming',
  cancelled: 'urgent',
  refunded: 'draft',
}
const paymentStatusBadge: Record<PaymentStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  paid: 'active',
  pending: 'upcoming',
  overdue: 'urgent',
  refunded: 'draft',
  failed: 'urgent',
}

const tierLabels: Record<MemberTier, string> = {
  tier_1: 'Tier 1',
  tier_2: 'Tier 2',
  tier_3: 'Tier 3',
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
const typeOptions = [
  { value: 'individual', label: 'Individual' },
  { value: 'business', label: 'Business' },
]
const tierOptions = [
  { value: 'tier_1', label: 'Tier 1' },
  { value: 'tier_2', label: 'Tier 2' },
  { value: 'tier_3', label: 'Tier 3' },
]
const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const confirm = useConfirm()

  const [member, setMember] = useState<MemberDetail | null>(null)
  // The original membership application that produced this member, if
  // any. Matched by email — we don't have a hard FK because applications
  // can predate the auth user. This holds all the rich applicant data
  // (address, photo, socials, identity, business meta) that the admin
  // should see on this page.
  const [application, setApplication] = useState<ApplicationRow | null>(null)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [memberTagIds, setMemberTagIds] = useState<string[]>([])
  const [intros, setIntros] = useState<IntroRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'intros' | 'events' | 'payments'>('intros')
  const [actionPending, setActionPending] = useState<'cancel' | 'delete' | null>(null)

  const form = useForm<EditFormData>({ resolver: zodResolver(editSchema) })

  useEffect(() => {
    if (id) fetchAll(id)
  }, [id])

  async function fetchAll(memberId: string) {
    setLoading(true)
    const [memberRes, tagsRes, memberTagsRes, introsARes, introsBRes, bookingsRes, paymentsRes] =
      await Promise.all([
        supabase.from('members').select(`*, profiles(*)`).eq('id', memberId).single(),
        supabase.from('tags').select('*').order('category').order('name'),
        supabase.from('member_tags').select('tag_id').eq('member_id', memberId),
        supabase
          .from('introductions')
          .select(
            'id, status, match_score, match_reason, created_at, member_b_id, members!introductions_member_b_id_fkey(profiles(first_name, last_name, company_name))',
          )
          .eq('member_a_id', memberId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('introductions')
          .select(
            'id, status, match_score, match_reason, created_at, member_a_id, members!introductions_member_a_id_fkey(profiles(first_name, last_name, company_name))',
          )
          .eq('member_b_id', memberId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('bookings')
          .select('id, status, amount_pence, created_at, events(title, start_date, venue_name)')
          .eq('member_id', memberId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('payments')
          .select('*')
          .eq('member_id', memberId)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

    if (memberRes.data) {
      const m = memberRes.data as unknown as MemberDetail
      setMember(m)

      // Try to fetch the original application by email. If there are
      // multiple (e.g. they reapplied), take the most recent approved one,
      // else the most recent of any status.
      if (m.profiles?.email) {
        const { data: apps } = await supabase
          .from('membership_applications')
          .select('*')
          .eq('email', m.profiles.email)
          .order('created_at', { ascending: false })
        if (apps && apps.length > 0) {
          const approved = apps.find((a) => a.status === 'approved')
          setApplication((approved ?? apps[0]) as ApplicationRow)
        } else {
          setApplication(null)
        }
      }
    }
    if (tagsRes.data) setAllTags(tagsRes.data)
    if (memberTagsRes.data) setMemberTagIds(memberTagsRes.data.map((t) => t.tag_id))

    const allIntros: IntroRow[] = []
    if (introsARes.data) {
      for (const row of introsARes.data as unknown as Array<Record<string, unknown>>) {
        const members = row.members as
          | { profiles: { first_name: string | null; last_name: string | null; company_name: string | null } }
          | undefined
        allIntros.push({
          id: row.id as string,
          status: row.status as IntroStatus,
          match_score: row.match_score as number | null,
          match_reason: row.match_reason as string | null,
          created_at: row.created_at as string,
          other_member: members
            ? { profiles: members.profiles }
            : { profiles: { first_name: null, last_name: null, company_name: null } },
        })
      }
    }
    if (introsBRes.data) {
      for (const row of introsBRes.data as unknown as Array<Record<string, unknown>>) {
        const members = row.members as
          | { profiles: { first_name: string | null; last_name: string | null; company_name: string | null } }
          | undefined
        allIntros.push({
          id: row.id as string,
          status: row.status as IntroStatus,
          match_score: row.match_score as number | null,
          match_reason: row.match_reason as string | null,
          created_at: row.created_at as string,
          other_member: members
            ? { profiles: members.profiles }
            : { profiles: { first_name: null, last_name: null, company_name: null } },
        })
      }
    }
    allIntros.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    setIntros(allIntros)

    if (bookingsRes.data) setBookings(bookingsRes.data as unknown as BookingRow[])
    if (paymentsRes.data) setPayments(paymentsRes.data as unknown as PaymentRow[])
    setLoading(false)
  }

  function startEditing() {
    if (!member) return
    form.reset({
      first_name: member.profiles.first_name ?? '',
      last_name: member.profiles.last_name ?? '',
      email: member.profiles.email ?? '',
      phone: member.profiles.phone ?? '',
      job_title: member.profiles.job_title ?? '',
      bio: member.profiles.bio ?? '',
      linkedin_url: member.profiles.linkedin_url ?? '',
      website_url: member.profiles.website_url ?? '',
      company_name: member.company_name ?? '',
      company_description: member.company_description ?? '',
      company_website: member.company_website ?? '',
      membership_type: member.membership_type as 'individual' | 'business',
      membership_tier: member.membership_tier,
      membership_status: member.membership_status,
      notes: member.notes ?? '',
    })
    setEditing(true)
  }

  async function onSave(data: EditFormData) {
    if (!member || !id) return
    setSaving(true)

    await supabase
      .from('profiles')
      .update({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone || null,
        job_title: data.job_title || null,
        bio: data.bio || null,
        linkedin_url: data.linkedin_url || null,
        website_url: data.website_url || null,
      })
      .eq('id', member.profile_id)

    await supabase
      .from('members')
      .update({
        membership_type: data.membership_type,
        membership_tier: data.membership_tier,
        membership_status: data.membership_status,
        company_name: data.company_name || null,
        company_description: data.company_description || null,
        company_website: data.company_website || null,
        notes: data.notes || null,
      })
      .eq('id', id)

    await supabase.from('member_tags').delete().eq('member_id', id)
    if (memberTagIds.length > 0) {
      await supabase
        .from('member_tags')
        .insert(memberTagIds.map((tagId) => ({ member_id: id, tag_id: tagId })))
    }

    setSaving(false)
    setEditing(false)
    fetchAll(id)
  }

  function toggleTag(tagId: string) {
    setMemberTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((i) => i !== tagId) : [...prev, tagId],
    )
  }

  async function handleCancelMembership() {
    if (!member) return
    const name =
      `${member.profiles.first_name ?? ''} ${member.profiles.last_name ?? ''}`.trim() ||
      'this member'
    const ok = await confirm({
      title: `Cancel ${name}'s membership?`,
      description: (
        <span>
          Their status moves to <strong className="text-text">cancelled</strong>. They lose access
          to <strong className="text-text">/portal</strong> immediately — any signed-in session is
          revoked. Their Stripe subscription (if any) is set to end at the close of the current
          billing period, so they keep paid time. You can reactivate them by editing the member and
          changing the status back to active.
        </span>
      ),
      confirmLabel: 'Cancel membership',
      tone: 'danger',
    })
    if (!ok) return
    setActionPending('cancel')
    const res = await fetch('/api/admin/members/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member_id: member.id }),
    })
    const json = await res.json()
    setActionPending(null)
    if (!res.ok) {
      toast({ title: 'Cancel failed', description: json.error, variant: 'destructive' })
      return
    }
    toast({
      title: 'Membership cancelled',
      description: name,
    })
    fetchAll(member.id)
  }

  async function handleDelete() {
    if (!member) return
    const name =
      `${member.profiles.first_name ?? ''} ${member.profiles.last_name ?? ''}`.trim() ||
      'this member'
    const ok = await confirm({
      title: `Delete ${name}?`,
      description: (
        <span>
          Their auth account, profile, members row, bookings and introductions are permanently
          removed. Any Stripe subscription is cancelled immediately. This cannot be undone.
        </span>
      ),
      confirmLabel: 'Delete permanently',
      tone: 'danger',
    })
    if (!ok) return
    setActionPending('delete')
    const res = await fetch('/api/admin/members/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member_id: member.id }),
    })
    const json = await res.json()
    if (!res.ok) {
      setActionPending(null)
      toast({ title: 'Delete failed', description: json.error, variant: 'destructive' })
      return
    }
    toast({
      title: json.soft_deleted ? 'Member archived' : 'Member deleted',
      description: name,
    })
    router.push('/dashboard/members')
  }

  if (loading || !member) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading member…</span>
        </div>
      </div>
    )
  }

  const name = `${member.profiles.first_name ?? ''} ${member.profiles.last_name ?? ''}`.trim()
  const tagsByCategory = allTags.reduce<Record<string, Tag[]>>((acc, t) => {
    if (!acc[t.category]) acc[t.category] = []
    acc[t.category].push(t)
    return acc
  }, {})

  const tabs = [
    { key: 'intros' as const, label: 'Introductions', count: intros.length },
    { key: 'events' as const, label: 'Event history', count: bookings.length },
    { key: 'payments' as const, label: 'Payments', count: payments.length },
  ]

  // Photo precedence — member profile avatar wins, falls back to the
  // photo the applicant uploaded on the public form.
  const photoUrl = member.profiles.avatar_url ?? application?.photo_url ?? null

  // Address from the application — admin's only source for this.
  const addressLine = application
    ? [
        application.address_line_1,
        application.address_line_2,
        application.city,
        application.postcode,
      ]
        .filter(Boolean)
        .join(', ')
    : ''

  const socials = application
    ? [
        { icon: <Linkedin size={13} />, label: 'LinkedIn', url: member.profiles.linkedin_url ?? application.linkedin_url },
        { icon: <Instagram size={13} />, label: 'Instagram', url: application.instagram_url },
        { icon: <AtSign size={13} />, label: 'X', url: application.x_url },
        { icon: <Youtube size={13} />, label: 'YouTube', url: application.youtube_url },
        { icon: <Music2 size={13} />, label: 'TikTok', url: application.tiktok_url },
        { icon: <Globe size={13} />, label: 'Website', url: member.profiles.website_url ?? application.website_url },
      ].filter((s) => s.url)
    : member.profiles.linkedin_url || member.profiles.website_url
      ? [
          { icon: <Linkedin size={13} />, label: 'LinkedIn', url: member.profiles.linkedin_url },
          { icon: <Globe size={13} />, label: 'Website', url: member.profiles.website_url },
        ].filter((s) => s.url)
      : []

  const isCancelled = member.membership_status === 'cancelled'

  return (
    <div className="p-4 md:p-8 max-w-5xl">
      {/* Back + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <button
          onClick={() => router.push('/dashboard/members')}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors self-start"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          Back to members
        </button>
        {!editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              icon={<Pencil size={14} />}
              size="sm"
              onClick={startEditing}
            >
              Edit
            </Button>
            {!isCancelled && (
              <Button
                variant="ghost"
                icon={<Ban size={14} />}
                size="sm"
                className="text-accent-warm"
                loading={actionPending === 'cancel'}
                onClick={handleCancelMembership}
              >
                Cancel membership
              </Button>
            )}
            <Button
              variant="danger"
              icon={<Trash2 size={14} />}
              size="sm"
              loading={actionPending === 'delete'}
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              icon={<X size={14} />}
              size="sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button
              icon={<Save size={14} />}
              size="sm"
              loading={saving}
              onClick={form.handleSubmit(onSave)}
            >
              Save changes
            </Button>
          </div>
        )}
      </div>

      {/* Cancelled banner */}
      {isCancelled && !editing && (
        <div className="mb-6 px-4 py-3 rounded-[var(--radius-md)] bg-[rgba(196,105,74,0.1)] border border-[rgba(196,105,74,0.25)] flex items-start gap-3">
          <Ban size={16} className="text-accent-warm flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-text">Membership cancelled</p>
            <p className="text-xs text-text-muted mt-0.5">
              This member can no longer sign into the portal. Edit and set status back to “active”
              to reinstate them.
            </p>
          </div>
        </div>
      )}

      {/* Profile card */}
      <Card className="mb-6">
        <CardContent className="py-5 md:py-6">
          {!editing ? (
            <div className="flex flex-col sm:flex-row gap-5 sm:gap-6">
              <div className="flex-shrink-0">
                {photoUrl ? (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-gold/15 ring-1 ring-gold/30">
                    <Image
                      src={photoUrl}
                      alt={name}
                      width={112}
                      height={112}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <Avatar src={null} name={name} size="xl" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-1">
                  <h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">
                    {name || 'Unnamed'}
                  </h2>
                  <Badge variant={statusBadge[member.membership_status]} dot>
                    {member.membership_status}
                  </Badge>
                  <Badge variant="info">{tierLabels[member.membership_tier]}</Badge>
                </div>
                {member.profiles.job_title && (
                  <p className="text-sm text-text">
                    {member.profiles.job_title}
                    {(member.company_name || member.profiles.company_name) && (
                      <>
                        <span className="text-text-dim"> at </span>
                        <span className="text-text">
                          {member.company_name || member.profiles.company_name}
                        </span>
                      </>
                    )}
                  </p>
                )}
                {!member.profiles.job_title && (member.company_name || member.profiles.company_name) && (
                  <p className="text-sm text-text">
                    {member.company_name || member.profiles.company_name}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-text-muted">
                  {member.profiles.email && (
                    <a
                      href={`mailto:${member.profiles.email}`}
                      className="inline-flex items-center gap-1.5 hover:text-gold transition-colors"
                    >
                      <Mail size={12} />
                      {member.profiles.email}
                    </a>
                  )}
                  {member.profiles.phone && (
                    <a
                      href={`tel:${member.profiles.phone.replace(/\s/g, '')}`}
                      className="inline-flex items-center gap-1.5 hover:text-gold transition-colors"
                    >
                      <Phone size={12} />
                      {member.profiles.phone}
                    </a>
                  )}
                </div>
                {member.profiles.bio && (
                  <p className="text-sm text-text-muted mt-3 leading-relaxed">
                    {member.profiles.bio}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-xs text-text-dim">
                  <span>
                    <span className="text-text-muted">Type:</span> {member.membership_type}
                  </span>
                  <span>
                    <span className="text-text-muted">Intros:</span> {member.intros_used_this_month}
                    /{member.monthly_intro_quota}
                  </span>
                  {member.membership_start_date && (
                    <span>
                      <span className="text-text-muted">Joined:</span>{' '}
                      {formatDate(member.membership_start_date)}
                    </span>
                  )}
                  {member.renewal_date && (
                    <span>
                      <span className="text-text-muted">Renewal:</span>{' '}
                      {formatDate(member.renewal_date)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="First name"
                  error={form.formState.errors.first_name?.message}
                  {...form.register('first_name')}
                />
                <Input
                  label="Last name"
                  error={form.formState.errors.last_name?.message}
                  {...form.register('last_name')}
                />
                <Input label="Email" type="email" {...form.register('email')} />
                <Input label="Phone" {...form.register('phone')} />
                <Input label="Job title" {...form.register('job_title')} />
                <Input label="LinkedIn URL" {...form.register('linkedin_url')} />
                <Input
                  label="Website URL"
                  className="sm:col-span-2"
                  {...form.register('website_url')}
                />
              </div>
              <Textarea label="Bio" rows={3} {...form.register('bio')} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Company name" {...form.register('company_name')} />
                <Input label="Company website" {...form.register('company_website')} />
              </div>
              <Textarea
                label="Company description"
                rows={2}
                {...form.register('company_description')}
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Select label="Type" options={typeOptions} {...form.register('membership_type')} />
                <Select label="Tier" options={tierOptions} {...form.register('membership_tier')} />
                <Select
                  label="Status"
                  options={statusOptions}
                  {...form.register('membership_status')}
                />
              </div>
              <Textarea label="Notes" rows={2} {...form.register('notes')} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscription */}
      {!editing && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard size={16} className="text-gold" />
              <CardTitle>Subscription</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  Status
                </p>
                <div className="mt-1">
                  {isCancelled ? (
                    <Badge variant="urgent" dot>
                      Cancelled
                    </Badge>
                  ) : member.stripe_subscription_id ? (
                    <Badge variant="active" dot>
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="draft" dot>
                      No subscription
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  Stripe subscription
                </p>
                <p className="text-sm text-text-muted mt-1 font-mono truncate">
                  {member.stripe_subscription_id || '—'}
                </p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  Stripe customer
                </p>
                <p className="text-sm text-text-muted mt-1 font-mono truncate">
                  {member.stripe_customer_id || '—'}
                </p>
              </div>
              <div>
                <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-dim">
                  {isCancelled ? 'Ended' : 'Next renewal'}
                </p>
                <p className="text-sm font-medium text-text mt-1">
                  {isCancelled
                    ? member.membership_end_date
                      ? formatDate(member.membership_end_date)
                      : '—'
                    : member.renewal_date
                      ? formatDate(member.renewal_date)
                      : '—'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Application data — only if we found a linked application */}
      {application && !editing && (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <UserIcon size={16} className="text-gold" />
                <CardTitle>Application data</CardTitle>
              </div>
              <span className="text-[11px] text-text-dim">
                Submitted {formatDate(application.created_at)}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-7">
            {/* Address + preferred location */}
            {(addressLine || application.preferred_location) && (
              <Section title="Where they're based" icon={<MapPin size={11} />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                  {addressLine && (
                    <DetailRow
                      icon={<MapPin size={13} />}
                      label="Address"
                      value={addressLine}
                      className="sm:col-span-2"
                    />
                  )}
                  {application.preferred_location && (
                    <DetailRow
                      icon={<MapPin size={13} />}
                      label="Preferred location"
                      value={application.preferred_location}
                    />
                  )}
                </div>
              </Section>
            )}

            {/* Identity */}
            {(application.nationality || application.identifies_as || application.pronouns) && (
              <Section title="Identity" icon={<UserIcon size={11} />}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5">
                  {application.nationality && (
                    <DetailRow label="Nationality" value={application.nationality} />
                  )}
                  {application.identifies_as && (
                    <DetailRow label="Identifies as" value={application.identifies_as} />
                  )}
                  {application.pronouns && (
                    <DetailRow label="Pronouns" value={application.pronouns} />
                  )}
                </div>
              </Section>
            )}

            {/* Bio + Interests */}
            {(application.bio || (application.interests && application.interests.length > 0)) && (
              <Section title="From their application" icon={<Quote size={11} />}>
                {application.bio && application.bio !== member.profiles.bio && (
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-dim mb-2">
                      Original bio
                    </p>
                    <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
                      {application.bio}
                    </p>
                  </div>
                )}
                {application.interests && application.interests.length > 0 && (
                  <div className={application.bio ? 'mt-5' : ''}>
                    <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-dim mb-2">
                      Events they were keen on
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {application.interests.map((int) => (
                        <span
                          key={int}
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-gold-muted text-gold-dark border border-border-gold"
                        >
                          <Heart size={10} />
                          {int}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Section>
            )}

            {/* Business meta from application (not already on member) */}
            {(application.industry ||
              application.work_email ||
              application.annual_turnover ||
              application.employees) && (
              <Section title="Business details" icon={<Building2 size={11} />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                  {application.industry && (
                    <DetailRow label="Industry" value={application.industry} />
                  )}
                  {application.work_email && (
                    <DetailRow
                      icon={<Mail size={13} />}
                      label="Work email"
                      value={application.work_email}
                      link={`mailto:${application.work_email}`}
                    />
                  )}
                  {application.annual_turnover && (
                    <DetailRow
                      icon={<TrendingUp size={13} />}
                      label="Annual turnover"
                      value={application.annual_turnover}
                    />
                  )}
                  {application.employees && (
                    <DetailRow
                      icon={<UsersIcon size={13} />}
                      label="Employees"
                      value={application.employees}
                    />
                  )}
                </div>
              </Section>
            )}

            {/* Online presence */}
            {socials.length > 0 && (
              <Section title="Online presence" icon={<Globe size={11} />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                  {socials.map((s) => (
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

            {/* Membership preference at apply-time */}
            {(application.payment_preference || application.preferred_tier) && (
              <Section title="At application time" icon={<CreditCard size={11} />}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                  {application.preferred_tier && (
                    <DetailRow label="Preferred tier" value={application.preferred_tier} />
                  )}
                  {application.payment_preference && (
                    <DetailRow label="Payment cadence" value={application.payment_preference} />
                  )}
                </div>
              </Section>
            )}

            {/* How they heard */}
            {(application.referral_source || application.referral_name) && (
              <Section title="How they heard" icon={<Heart size={11} />}>
                <p className="text-sm text-text-muted">
                  {application.referral_source ?? '—'}
                  {application.referral_name && (
                    <span className="text-text-dim"> · via {application.referral_name}</span>
                  )}
                </p>
              </Section>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tags */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TagIcon size={16} className="text-gold" />
            <CardTitle>Tags</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {!editing ? (
            <div className="space-y-3">
              {(() => {
                const memberTags = allTags.filter((t) => memberTagIds.includes(t.id))
                if (memberTags.length === 0) {
                  return <span className="text-sm text-text-dim">No tags assigned</span>
                }
                const grouped: Record<string, Tag[]> = {}
                for (const tag of memberTags) {
                  if (!grouped[tag.category]) grouped[tag.category] = []
                  grouped[tag.category].push(tag)
                }
                return CATEGORY_ORDER.filter((cat) => grouped[cat]?.length > 0).map((category) => (
                  <div key={category}>
                    <p className="text-xs font-medium text-text-muted mb-1.5">
                      {CATEGORY_LABELS[category] ?? category} ({grouped[category].length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {grouped[category].map((tag) => (
                        <span
                          key={tag.id}
                          className={`px-2.5 py-1 text-xs rounded-full ${CATEGORY_STYLES[category] ?? 'bg-gold-muted text-gold border border-border-gold'}`}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              })()}
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(tagsByCategory).map(([category, categoryTags]) => (
                <div key={category}>
                  <p className="text-xs font-medium text-text-muted mb-1.5">
                    {CATEGORY_LABELS[category] ?? category}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {categoryTags.map((tag) => {
                      const selected = memberTagIds.includes(tag.id)
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className={cn(
                            'px-2.5 py-1 text-xs rounded-full border transition-colors',
                            selected
                              ? 'bg-gold text-white border-gold'
                              : 'bg-surface text-text-muted border-border hover:border-border-hover',
                          )}
                        >
                          {tag.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History tabs */}
      <Card>
        <CardHeader className="pb-0 border-b-0">
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-4 py-2.5 text-sm transition-colors relative whitespace-nowrap',
                  activeTab === tab.key
                    ? 'text-gold font-medium'
                    : 'text-text-muted hover:text-text',
                )}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className="ml-1.5 text-xs text-text-dim">({tab.count})</span>
                )}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-gold rounded-full" />
                )}
              </button>
            ))}
          </div>
        </CardHeader>
        <div className="border-t border-border overflow-x-auto">
          {activeTab === 'intros' &&
            (intros.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-text-dim">
                No introductions yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Connected with</TableHead>
                    <TableHead>Match score</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intros.map((intro) => (
                    <TableRow key={intro.id}>
                      <TableCell className="font-medium">
                        {`${intro.other_member.profiles.first_name ?? ''} ${intro.other_member.profiles.last_name ?? ''}`.trim() ||
                          '—'}
                        {intro.other_member.profiles.company_name && (
                          <span className="text-text-dim ml-1 font-normal">
                            ({intro.other_member.profiles.company_name})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {intro.match_score != null
                          ? `${Math.round(intro.match_score * 100)}%`
                          : '—'}
                      </TableCell>
                      <TableCell className="text-text-muted max-w-[200px] truncate">
                        {intro.match_reason || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={introStatusBadge[intro.status]} dot>
                          {intro.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-text-muted">
                        {formatDate(intro.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ))}

          {activeTab === 'events' &&
            (bookings.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-text-dim">
                No event bookings yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Event</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bookings.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.events?.title ?? '—'}</TableCell>
                      <TableCell className="text-text-muted">
                        {b.events?.start_date ? formatDate(b.events.start_date) : '—'}
                      </TableCell>
                      <TableCell className="text-text-muted">{b.events?.venue_name || '—'}</TableCell>
                      <TableCell>{formatCurrency(b.amount_pence)}</TableCell>
                      <TableCell>
                        <Badge variant={bookingStatusBadge[b.status]} dot>
                          {b.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ))}

          {activeTab === 'payments' &&
            (payments.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-text-dim">No payments yet</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Paid</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium capitalize">{p.payment_type}</TableCell>
                      <TableCell className="text-text-muted max-w-[200px] truncate">
                        {p.description || '—'}
                      </TableCell>
                      <TableCell>{formatCurrency(p.amount_pence)}</TableCell>
                      <TableCell className="text-text-muted">
                        {p.due_date ? formatDate(p.due_date) : '—'}
                      </TableCell>
                      <TableCell className="text-text-muted">
                        {p.paid_at ? formatDate(p.paid_at) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={paymentStatusBadge[p.status]} dot>
                          {p.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ))}
        </div>
      </Card>
    </div>
  )
}

// ─── Section + DetailRow primitives (same vocabulary as applications) ─

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
      <p className="font-[family-name:var(--font-label)] text-[10px] font-medium uppercase tracking-[0.28em] text-gold-dark mb-4 inline-flex items-center gap-2">
        {icon && (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gold/12 text-gold">
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
  value: string | null | undefined
  link?: string
  className?: string
}) {
  if (!value) return null
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-center gap-1.5 mb-1.5">
        {icon && (
          <span className="inline-flex items-center justify-center w-4 h-4 text-text-dim">
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
          className="block text-[14px] font-medium text-text hover:text-gold transition-colors break-words leading-snug"
        >
          {value}
        </a>
      ) : (
        <p className="text-[14px] font-medium text-text break-words leading-snug">{value}</p>
      )}
    </div>
  )
}
