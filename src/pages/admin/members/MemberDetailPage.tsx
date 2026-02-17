import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '../../../lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Input } from '../../../components/ui/Input'
import { Select } from '../../../components/ui/Select'
import { Textarea } from '../../../components/ui/Textarea'
import { Avatar } from '../../../components/ui/Avatar'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/Table'
import { formatDate, formatCurrency, cn } from '../../../lib/utils'
import { ArrowLeft, Pencil, X, Save } from 'lucide-react'
import type { Database } from '../../../types/database'

type Tag = Database['public']['Tables']['tags']['Row']
type MemberStatus = Database['public']['Enums']['membership_status']
type MemberTier = Database['public']['Enums']['membership_tier']
type IntroStatus = Database['public']['Enums']['intro_status']
type BookingStatus = Database['public']['Enums']['booking_status']
type PaymentStatus = Database['public']['Enums']['payment_status']

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
  other_member: { profiles: { first_name: string | null; last_name: string | null; company_name: string | null } }
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
  active: 'active', pending: 'upcoming', expired: 'draft', cancelled: 'urgent',
}
const introStatusBadge: Record<IntroStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  suggested: 'draft', approved: 'upcoming', sent: 'info', accepted: 'active', completed: 'active', declined: 'urgent',
}
const bookingStatusBadge: Record<BookingStatus, 'active' | 'upcoming' | 'draft' | 'urgent'> = {
  confirmed: 'active', pending: 'upcoming', cancelled: 'urgent', refunded: 'draft',
}
const paymentStatusBadge: Record<PaymentStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  paid: 'active', pending: 'upcoming', overdue: 'urgent', refunded: 'draft', failed: 'urgent',
}

const tierLabels: Record<MemberTier, string> = { tier_1: 'Tier 1', tier_2: 'Tier 2', tier_3: 'Tier 3' }

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
const typeOptions = [{ value: 'individual', label: 'Individual' }, { value: 'business', label: 'Business' }]
const tierOptions = [{ value: 'tier_1', label: 'Tier 1' }, { value: 'tier_2', label: 'Tier 2' }, { value: 'tier_3', label: 'Tier 3' }]
const statusOptions = [{ value: 'active', label: 'Active' }, { value: 'pending', label: 'Pending' }, { value: 'expired', label: 'Expired' }, { value: 'cancelled', label: 'Cancelled' }]

export function MemberDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [member, setMember] = useState<MemberDetail | null>(null)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [memberTagIds, setMemberTagIds] = useState<string[]>([])
  const [intros, setIntros] = useState<IntroRow[]>([])
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'intros' | 'events' | 'payments'>('intros')

  const form = useForm<EditFormData>({ resolver: zodResolver(editSchema) })

  useEffect(() => {
    if (id) fetchAll(id)
  }, [id])

  async function fetchAll(memberId: string) {
    setLoading(true)
    const [memberRes, tagsRes, memberTagsRes, introsARes, introsBRes, bookingsRes, paymentsRes] = await Promise.all([
      supabase.from('members').select(`*, profiles(*)`).eq('id', memberId).single(),
      supabase.from('tags').select('*').order('category').order('name'),
      supabase.from('member_tags').select('tag_id').eq('member_id', memberId),
      supabase.from('introductions').select(`id, status, match_score, match_reason, created_at, member_b_id, members!introductions_member_b_id_fkey(profiles(first_name, last_name, company_name))`).eq('member_a_id', memberId).order('created_at', { ascending: false }).limit(20),
      supabase.from('introductions').select(`id, status, match_score, match_reason, created_at, member_a_id, members!introductions_member_a_id_fkey(profiles(first_name, last_name, company_name))`).eq('member_b_id', memberId).order('created_at', { ascending: false }).limit(20),
      supabase.from('bookings').select(`id, status, amount_pence, created_at, events(title, start_date, venue_name)`).eq('member_id', memberId).order('created_at', { ascending: false }).limit(20),
      supabase.from('payments').select('*').eq('member_id', memberId).order('created_at', { ascending: false }).limit(20),
    ])

    if (memberRes.data) {
      setMember(memberRes.data as unknown as MemberDetail)
    }
    if (tagsRes.data) setAllTags(tagsRes.data)
    if (memberTagsRes.data) setMemberTagIds(memberTagsRes.data.map((t) => t.tag_id))

    // Merge intros from both sides
    const allIntros: IntroRow[] = []
    if (introsARes.data) {
      for (const row of introsARes.data as unknown as Array<Record<string, unknown>>) {
        const members = row.members as { profiles: { first_name: string | null; last_name: string | null; company_name: string | null } } | undefined
        allIntros.push({ id: row.id as string, status: row.status as IntroStatus, match_score: row.match_score as number | null, match_reason: row.match_reason as string | null, created_at: row.created_at as string, other_member: members ? { profiles: members.profiles } : { profiles: { first_name: null, last_name: null, company_name: null } } })
      }
    }
    if (introsBRes.data) {
      for (const row of introsBRes.data as unknown as Array<Record<string, unknown>>) {
        const members = row.members as { profiles: { first_name: string | null; last_name: string | null; company_name: string | null } } | undefined
        allIntros.push({ id: row.id as string, status: row.status as IntroStatus, match_score: row.match_score as number | null, match_reason: row.match_reason as string | null, created_at: row.created_at as string, other_member: members ? { profiles: members.profiles } : { profiles: { first_name: null, last_name: null, company_name: null } } })
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

    // Update profile
    await supabase.from('profiles').update({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone || null,
      job_title: data.job_title || null,
      bio: data.bio || null,
      linkedin_url: data.linkedin_url || null,
    }).eq('id', member.profile_id)

    // Update member
    await supabase.from('members').update({
      membership_type: data.membership_type,
      membership_tier: data.membership_tier,
      membership_status: data.membership_status,
      company_name: data.company_name || null,
      company_description: data.company_description || null,
      company_website: data.company_website || null,
      notes: data.notes || null,
    }).eq('id', id)

    // Sync tags — delete all, re-insert selected
    await supabase.from('member_tags').delete().eq('member_id', id)
    if (memberTagIds.length > 0) {
      await supabase.from('member_tags').insert(
        memberTagIds.map((tagId) => ({ member_id: id, tag_id: tagId }))
      )
    }

    setSaving(false)
    setEditing(false)
    fetchAll(id)
  }

  function toggleTag(tagId: string) {
    setMemberTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((i) => i !== tagId) : [...prev, tagId]
    )
  }

  if (loading || !member) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading member...</span>
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
    { key: 'events' as const, label: 'Event History', count: bookings.length },
    { key: 'payments' as const, label: 'Payments', count: payments.length },
  ]

  return (
    <div className="p-8 max-w-5xl">
      {/* Back + actions */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => navigate('/dashboard/members')}
          className="flex items-center gap-2 text-sm text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={16} strokeWidth={1.5} />
          Back to Members
        </button>
        {!editing ? (
          <Button variant="secondary" icon={<Pencil size={14} />} size="sm" onClick={startEditing}>
            Edit Member
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" icon={<X size={14} />} size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button icon={<Save size={14} />} size="sm" loading={saving} onClick={form.handleSubmit(onSave)}>
              Save Changes
            </Button>
          </div>
        )}
      </div>

      {/* Profile card */}
      <Card className="mb-6">
        <CardContent className="py-6">
          {!editing ? (
            /* View mode */
            <div className="flex gap-6">
              <Avatar src={member.profiles.avatar_url} name={name} size="xl" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="font-[family-name:var(--font-heading)] text-2xl font-semibold text-text">
                    {name || 'Unnamed'}
                  </h2>
                  <Badge variant={statusBadge[member.membership_status]} dot>
                    {member.membership_status}
                  </Badge>
                  <Badge variant="info">{tierLabels[member.membership_tier]}</Badge>
                </div>
                {member.profiles.job_title && (
                  <p className="text-sm text-text-muted">{member.profiles.job_title}</p>
                )}
                {(member.company_name || member.profiles.company_name) && (
                  <p className="text-sm text-text-muted">
                    {member.company_name || member.profiles.company_name}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-text-muted">
                  {member.profiles.email && <span>{member.profiles.email}</span>}
                  {member.profiles.phone && <span>{member.profiles.phone}</span>}
                  {member.profiles.linkedin_url && (
                    <a href={member.profiles.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">LinkedIn</a>
                  )}
                </div>
                {member.profiles.bio && (
                  <p className="text-sm text-text-muted mt-3">{member.profiles.bio}</p>
                )}
                <div className="flex flex-wrap gap-x-6 gap-y-1 mt-4 text-xs text-text-dim">
                  <span>Type: {member.membership_type}</span>
                  <span>Intros: {member.intros_used_this_month}/{member.monthly_intro_quota}</span>
                  {member.membership_start_date && <span>Joined: {formatDate(member.membership_start_date)}</span>}
                  {member.renewal_date && <span>Renewal: {formatDate(member.renewal_date)}</span>}
                </div>
              </div>
            </div>
          ) : (
            /* Edit mode */
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Input label="First Name" error={form.formState.errors.first_name?.message} {...form.register('first_name')} />
                <Input label="Last Name" error={form.formState.errors.last_name?.message} {...form.register('last_name')} />
                <Input label="Email" type="email" {...form.register('email')} />
                <Input label="Phone" {...form.register('phone')} />
                <Input label="Job Title" {...form.register('job_title')} />
                <Input label="LinkedIn URL" {...form.register('linkedin_url')} />
              </div>
              <Textarea label="Bio" rows={2} {...form.register('bio')} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Company Name" {...form.register('company_name')} />
                <Input label="Company Website" {...form.register('company_website')} />
              </div>
              <Textarea label="Company Description" rows={2} {...form.register('company_description')} />
              <div className="grid grid-cols-3 gap-4">
                <Select label="Type" options={typeOptions} {...form.register('membership_type')} />
                <Select label="Tier" options={tierOptions} {...form.register('membership_tier')} />
                <Select label="Status" options={statusOptions} {...form.register('membership_status')} />
              </div>
              <Textarea label="Notes" rows={2} {...form.register('notes')} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tags */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Tags</CardTitle>
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
                return CATEGORY_ORDER
                  .filter((cat) => grouped[cat]?.length > 0)
                  .map((category) => (
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
                  <p className="text-xs font-medium text-text-muted mb-1.5">{CATEGORY_LABELS[category] ?? category}</p>
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
                              : 'bg-surface text-text-muted border-border hover:border-border-hover'
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
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'px-4 py-2.5 text-sm rounded-t-[var(--radius-md)] transition-colors relative',
                  activeTab === tab.key
                    ? 'text-gold font-medium bg-surface'
                    : 'text-text-muted hover:text-text'
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
        <div className="border-t border-border">
          {/* Introductions tab */}
          {activeTab === 'intros' && (
            intros.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-text-dim">No introductions yet</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Connected With</TableHead>
                    <TableHead>Match Score</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intros.map((intro) => (
                    <TableRow key={intro.id}>
                      <TableCell className="font-medium">
                        {`${intro.other_member.profiles.first_name ?? ''} ${intro.other_member.profiles.last_name ?? ''}`.trim() || '—'}
                        {intro.other_member.profiles.company_name && (
                          <span className="text-text-dim ml-1 font-normal">
                            ({intro.other_member.profiles.company_name})
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {intro.match_score != null ? `${Math.round(intro.match_score * 100)}%` : '—'}
                      </TableCell>
                      <TableCell className="text-text-muted max-w-[200px] truncate">
                        {intro.match_reason || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={introStatusBadge[intro.status]} dot>{intro.status}</Badge>
                      </TableCell>
                      <TableCell className="text-text-muted">{formatDate(intro.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}

          {/* Events tab */}
          {activeTab === 'events' && (
            bookings.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-text-dim">No event bookings yet</div>
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
                        <Badge variant={bookingStatusBadge[b.status]} dot>{b.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}

          {/* Payments tab */}
          {activeTab === 'payments' && (
            payments.length === 0 ? (
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
                        <Badge variant={paymentStatusBadge[p.status]} dot>{p.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </div>
      </Card>
    </div>
  )
}
