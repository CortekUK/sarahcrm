'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { RepsPanel } from './RepsPanel'
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
import { formatDate, formatDateTime, formatCurrency, cn } from '@/lib/utils'
import { MemberMatchesPanel } from './MemberMatchesPanel'
import { MemberDocumentsPanel } from './MemberDocumentsPanel'
import { GmailThreadPanel } from './GmailThreadPanel'
import { MemberRoiPanel } from '@/components/admin/MemberRoiPanel'
import { MemberScoresPanel } from '@/components/admin/MemberScoresPanel'
import { MemberRecommendationsPanel } from '@/components/admin/MemberRecommendationsPanel'
import {
  PLAN_OPTIONS,
  planForTier,
  introQuotaForTier,
  type MemberTier as PlanTier,
} from '@/lib/membership/plans'
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
  Sparkles,
  Plus,
  Check,
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
  // Relationship-intelligence fields (Spec §4) — curated subset surfaced
  sector: string | null
  sub_sector: string | null
  employee_count: string | null
  annual_turnover: string | null
  estimated_profit: string | null
  company_address: string | null
  invoice_address: string | null
  // Accounts & finance contacts (Phase 1) — who to bill / chase per company
  accounts_contact_name: string | null
  accounts_contact_email: string | null
  accounts_contact_phone: string | null
  invoice_chaser_contact: string | null
  fd_contact: string | null
  intro_target_types: string | null
  intro_target_criteria: string | null
  dream_introductions: string | null
  what_they_can_offer: string | null
  business_objectives: string | null
  budgets: string | null
  dietary_requirements: string | null
  partner_name: string | null
  assistant_name: string | null
  parent_member_id: string | null
  is_primary_rep: boolean
  rep_role: string | null
  company_linkedin_url: string | null
  // Enrichment tracking (autofilled company fields + provenance)
  enrichment_status: string | null
  enriched_at: string | null
  enrichment_source: string | null
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
  // The plan IS the tier; membership_type is derived from it on save.
  membership_tier: z.enum(['tier_1', 'tier_2', 'tier_3']),
  membership_status: z.enum(['active', 'pending', 'expired', 'cancelled', 'paused']),
  showcase_enabled: z.boolean(),
  notes: z.string().optional(),
  // ── Relationship intelligence (Spec §4) — curated high-value fields ──
  sector: z.string().optional(),
  sub_sector: z.string().optional(),
  employee_count: z.string().optional(),
  annual_turnover: z.string().optional(),
  estimated_profit: z.string().optional(),
  company_address: z.string().optional(),
  invoice_address: z.string().optional(),
  // Accounts & finance contacts (Phase 1)
  accounts_contact_name: z.string().optional(),
  accounts_contact_email: z
    .string()
    .email('Enter a valid email address')
    .or(z.literal(''))
    .optional(),
  accounts_contact_phone: z
    .string()
    .regex(/^[0-9+()\s-]*$/, 'Digits and + ( ) - only')
    .optional(),
  invoice_chaser_contact: z.string().optional(),
  fd_contact: z.string().optional(),
  intro_target_types: z.string().optional(),
  intro_target_criteria: z.string().optional(),
  dream_introductions: z.string().optional(),
  what_they_can_offer: z.string().optional(),
  business_objectives: z.string().optional(),
  budgets: z.string().optional(),
  dietary_requirements: z.string().optional(),
  partner_name: z.string().optional(),
  assistant_name: z.string().optional(),
})
type EditFormData = z.infer<typeof editSchema>

// Field config for the Relationship-Intelligence card — keeps the edit
// form and read view in sync without 16 repetitive blocks.
const RI_GROUPS: {
  title: string
  fields: { name: keyof EditFormData; label: string; long?: boolean; type?: 'email' | 'tel' }[]
}[] = [
  {
    title: 'Company depth',
    fields: [
      { name: 'sector', label: 'Sector' },
      { name: 'sub_sector', label: 'Sub-sector' },
      { name: 'employee_count', label: 'Employee count' },
      { name: 'annual_turnover', label: 'Annual turnover' },
      { name: 'estimated_profit', label: 'Estimated profit' },
      { name: 'company_address', label: 'Company address', long: true },
      { name: 'invoice_address', label: 'Invoice address', long: true },
    ],
  },
  {
    title: 'Accounts & finance contacts',
    fields: [
      { name: 'accounts_contact_name', label: 'Accounts payable contact' },
      { name: 'accounts_contact_email', label: 'Accounts email', type: 'email' },
      { name: 'accounts_contact_phone', label: 'Accounts phone', type: 'tel' },
      { name: 'invoice_chaser_contact', label: 'Invoice chaser' },
      { name: 'fd_contact', label: 'Finance director' },
    ],
  },
  {
    title: 'Introduction strategy',
    fields: [
      { name: 'intro_target_types', label: 'Who they want to meet' },
      { name: 'intro_target_criteria', label: 'Target criteria', long: true },
      { name: 'dream_introductions', label: 'Top dream introductions', long: true },
      { name: 'what_they_can_offer', label: 'What they can offer', long: true },
    ],
  },
  {
    title: 'Objectives & budgets',
    fields: [
      { name: 'business_objectives', label: 'Business objectives', long: true },
      { name: 'budgets', label: 'Marketing / events budgets', long: true },
    ],
  },
  {
    title: 'Preferences',
    fields: [
      { name: 'partner_name', label: 'Partner name' },
      { name: 'assistant_name', label: 'Assistant name' },
      { name: 'dietary_requirements', label: 'Dietary requirements', long: true },
    ],
  },
]

const statusBadge: Record<MemberStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  active: 'active',
  pending: 'upcoming',
  expired: 'draft',
  cancelled: 'urgent',
  paused: 'info',
}
const introStatusBadge: Record<IntroStatus, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  suggested: 'draft',
  approved: 'upcoming',
  sent: 'info',
  scheduled: 'upcoming',
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
// ── Lead-enrichment status vocabulary (mirrors the enquiry panel) ──
const ENRICHMENT_LABELS: Record<string, string> = {
  enriched: 'Enriched',
  partial: 'Company found',
  no_domain: 'No business domain',
  not_found: 'Not found',
  failed: 'Enrichment failed',
}
const ENRICHMENT_BADGE: Record<string, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  enriched: 'active',
  partial: 'info',
  no_domain: 'draft',
  not_found: 'draft',
  failed: 'urgent',
}

const statusOptions = [
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
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
  const [activeTab, setActiveTab] = useState<'events' | 'payments'>('events')
  const [actionPending, setActionPending] = useState<'cancel' | 'delete' | 'resend' | null>(null)
  const [enriching, setEnriching] = useState(false)
  // Bumped after a save so the suggested-introductions panel recomputes
  // against the freshly-saved tags.
  const [refreshKey, setRefreshKey] = useState(0)
  // AI tag suggestions (existing tags only, each with a reason).
  const [aiSuggestions, setAiSuggestions] = useState<
    { tag_id: string; name: string; category: string; reason: string }[]
  >([])
  const [aiLoading, setAiLoading] = useState(false)
  const [aiRan, setAiRan] = useState(false)
  // Inline quick-add of a brand-new tag.
  const [newTagName, setNewTagName] = useState('')
  const [newTagCategory, setNewTagCategory] = useState('industry')
  const [addingTag, setAddingTag] = useState(false)

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
      membership_tier: member.membership_tier,
      membership_status: member.membership_status,
      showcase_enabled: member.showcase_enabled,
      notes: member.notes ?? '',
      // Relationship intelligence
      sector: member.sector ?? '',
      sub_sector: member.sub_sector ?? '',
      employee_count: member.employee_count ?? '',
      annual_turnover: member.annual_turnover ?? '',
      estimated_profit: member.estimated_profit ?? '',
      company_address: member.company_address ?? '',
      invoice_address: member.invoice_address ?? '',
      accounts_contact_name: member.accounts_contact_name ?? '',
      accounts_contact_email: member.accounts_contact_email ?? '',
      accounts_contact_phone: member.accounts_contact_phone ?? '',
      invoice_chaser_contact: member.invoice_chaser_contact ?? '',
      fd_contact: member.fd_contact ?? '',
      intro_target_types: member.intro_target_types ?? '',
      intro_target_criteria: member.intro_target_criteria ?? '',
      dream_introductions: member.dream_introductions ?? '',
      what_they_can_offer: member.what_they_can_offer ?? '',
      business_objectives: member.business_objectives ?? '',
      budgets: member.budgets ?? '',
      dietary_requirements: member.dietary_requirements ?? '',
      partner_name: member.partner_name ?? '',
      assistant_name: member.assistant_name ?? '',
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

    // If the plan (tier) changed, reset the monthly intro quota to that
    // plan's allowance. Only on change, so a manual per-member override
    // isn't clobbered every time the form is saved.
    const tierChanged = data.membership_tier !== member.membership_tier
    const quotaUpdate = tierChanged
      ? { monthly_intro_quota: await introQuotaForTier(supabase, data.membership_tier as PlanTier) }
      : {}

    await supabase
      .from('members')
      .update({
        // membership_type follows the tier (the plan) — kept in lock-step
        // so the two columns can't drift apart.
        membership_type: planForTier(data.membership_tier as PlanTier).membershipType,
        membership_tier: data.membership_tier,
        ...quotaUpdate,
        membership_status: data.membership_status,
        showcase_enabled: data.showcase_enabled,
        company_name: data.company_name || null,
        company_description: data.company_description || null,
        company_website: data.company_website || null,
        notes: data.notes || null,
        // Relationship intelligence
        sector: data.sector || null,
        sub_sector: data.sub_sector || null,
        employee_count: data.employee_count || null,
        annual_turnover: data.annual_turnover || null,
        estimated_profit: data.estimated_profit || null,
        company_address: data.company_address || null,
        invoice_address: data.invoice_address || null,
        accounts_contact_name: data.accounts_contact_name || null,
        accounts_contact_email: data.accounts_contact_email || null,
        accounts_contact_phone: data.accounts_contact_phone || null,
        invoice_chaser_contact: data.invoice_chaser_contact || null,
        fd_contact: data.fd_contact || null,
        intro_target_types: data.intro_target_types || null,
        intro_target_criteria: data.intro_target_criteria || null,
        dream_introductions: data.dream_introductions || null,
        what_they_can_offer: data.what_they_can_offer || null,
        business_objectives: data.business_objectives || null,
        budgets: data.budgets || null,
        dietary_requirements: data.dietary_requirements || null,
        partner_name: data.partner_name || null,
        assistant_name: data.assistant_name || null,
      })
      .eq('id', id)

    // NOTE: tags are managed independently (persist instantly via toggleTag /
    // addQuickTag), so the profile/member Save no longer writes member_tags.

    setSaving(false)
    setEditing(false)
    setRefreshKey((k) => k + 1)
    fetchAll(id)
  }

  // Tags persist immediately (the Tags card is always editable, not gated
  // behind the Edit form), and bump refreshKey so matches recompute live.
  async function toggleTag(tagId: string) {
    if (!id) return
    const has = memberTagIds.includes(tagId)
    setMemberTagIds((prev) => (has ? prev.filter((i) => i !== tagId) : [...prev, tagId]))
    if (has) {
      await supabase.from('member_tags').delete().eq('member_id', id).eq('tag_id', tagId)
    } else {
      await supabase.from('member_tags').insert({ member_id: id, tag_id: tagId })
    }
    setRefreshKey((k) => k + 1)
  }

  async function runAiSuggestions() {
    setAiLoading(true)
    setAiRan(true)
    try {
      const res = await fetch(`/api/admin/members/${id}/suggest-tags`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'AI suggestion failed', description: json.error, variant: 'destructive' })
        setAiSuggestions([])
        return
      }
      setAiSuggestions(json.suggestions ?? [])
      if ((json.suggestions ?? []).length === 0 && json.note) {
        toast({ title: 'No suggestions', description: json.note })
      }
    } finally {
      setAiLoading(false)
    }
  }

  async function addQuickTag() {
    const name = newTagName.trim()
    if (!name) return
    setAddingTag(true)
    const { data, error } = await supabase
      .from('tags')
      .insert({ name, category: newTagCategory as Tag['category'] })
      .select('*')
      .single()
    setAddingTag(false)
    if (error || !data) {
      toast({
        title: 'Could not add tag',
        description: error?.code === '23505' ? 'That tag already exists.' : error?.message,
        variant: 'destructive',
      })
      return
    }
    setAllTags((prev) => [...prev, data as Tag])
    setMemberTagIds((prev) => [...prev, (data as Tag).id])
    if (id) await supabase.from('member_tags').insert({ member_id: id, tag_id: (data as Tag).id })
    setNewTagName('')
    setRefreshKey((k) => k + 1)
    toast({ title: 'Tag created', description: `"${name}" added and applied.` })
  }

  // Run (or re-run) Apollo enrichment for this member via the admin route.
  // Autofills gaps only; on success we refetch so the freshly-written company
  // fields (turnover, employees, sector, LinkedIn, website) visibly update.
  async function runEnrich() {
    if (!member || !id) return
    setEnriching(true)
    try {
      const res = await fetch('/api/admin/members/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: member.id }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        status?: string
        error?: string
      }
      if (!res.ok || !json.ok) {
        toast({
          title: 'Enrichment failed',
          description: json.error ?? 'Please try again.',
          variant: 'destructive',
        })
        return
      }
      await fetchAll(id)
      toast({
        title: 'Enrichment complete',
        description: `Status: ${ENRICHMENT_LABELS[json.status ?? ''] ?? json.status ?? 'done'}.`,
      })
    } catch (e) {
      toast({
        title: 'Enrichment failed',
        description: e instanceof Error ? e.message : 'Network error.',
        variant: 'destructive',
      })
    } finally {
      setEnriching(false)
    }
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

  async function handleResendInvite() {
    if (!member) return
    const name =
      `${member.profiles.first_name ?? ''} ${member.profiles.last_name ?? ''}`.trim() ||
      'this member'
    const ok = await confirm({
      title: `Send login details to ${name}?`,
      description: (
        <span>
          Emails {member.profiles.email ?? 'the member'} their login details — their email
          and a new temporary password to sign in to the members portal. They’ll be asked to
          change it after first login. Sent via The Club’s branded email.
        </span>
      ),
      confirmLabel: 'Send login email',
      tone: 'neutral',
    })
    if (!ok) return
    setActionPending('resend')
    const res = await fetch('/api/admin/members/resend-invite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ member_id: member.id }),
    })
    const json = await res.json()
    setActionPending(null)
    if (!res.ok) {
      toast({ title: 'Could not send', description: json.error, variant: 'destructive' })
      return
    }
    toast({ title: 'Login details sent', description: json.email })
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
  const memberFullName =
    `${member.profiles.first_name ?? ''} ${member.profiles.last_name ?? ''}`.trim() || 'this member'

  return (
    <div className="p-4 md:p-8">
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
            <Button
              variant="ghost"
              icon={<Mail size={14} />}
              size="sm"
              loading={actionPending === 'resend'}
              onClick={handleResendInvite}
            >
              Resend login
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
                    <span className="text-text-muted">Plan:</span>{' '}
                    {planForTier(member.membership_tier).name}
                  </span>
                  <span>
                    <span className="text-text-muted">Intros:</span> {member.intros_used_this_month}
                    /{member.monthly_intro_quota}
                  </span>
                  <span>
                    <span className="text-text-muted">Directory:</span>{' '}
                    {member.showcase_enabled ? 'Visible' : 'Hidden'}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select label="Plan" options={PLAN_OPTIONS} {...form.register('membership_tier')} />
                <Select
                  label="Status"
                  options={statusOptions}
                  {...form.register('membership_status')}
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-border text-gold accent-gold"
                  {...form.register('showcase_enabled')}
                />
                <span className="text-sm text-text">
                  Show in member directory
                  <span className="text-text-dim font-normal ml-1">
                    (visible to other members in the portal Network)
                  </span>
                </span>
              </label>
              <Textarea label="Notes" rows={2} {...form.register('notes')} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Relationship intelligence — the spec §4 profile core. Shows
          editable inputs while editing, otherwise a read view of whatever
          has been filled in. */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles size={16} className="text-gold" />
            <CardTitle>Relationship intelligence</CardTitle>
            {member.enrichment_status && (
              <Badge
                variant={ENRICHMENT_BADGE[member.enrichment_status] ?? 'info'}
                className="capitalize"
              >
                {ENRICHMENT_LABELS[member.enrichment_status] ?? member.enrichment_status}
              </Badge>
            )}
            {!editing && (
              <div className="ml-auto flex items-center gap-2">
                {member.enriched_at && (
                  <span className="text-[11px] text-text-dim">
                    {member.enrichment_source ? `${member.enrichment_source} · ` : ''}
                    {formatDateTime(member.enriched_at)}
                  </span>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Sparkles size={13} />}
                  loading={enriching}
                  onClick={runEnrich}
                >
                  {enriching ? 'Enriching…' : member.enriched_at ? 'Re-enrich' : 'Enrich'}
                </Button>
              </div>
            )}
          </div>
          <p className="text-xs text-text-dim mt-1.5">
            Autofills empty company fields (sector, turnover, employees, website, LinkedIn) from the
            enrichment provider — existing entries are never overwritten.
          </p>
        </CardHeader>
        <CardContent className="space-y-7">
          {RI_GROUPS.map((group) => (
            <Section key={group.title} title={group.title}>
              {editing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {group.fields.map((f) => {
                    if (f.long) {
                      return (
                        <Textarea
                          key={f.name}
                          label={f.label}
                          rows={2}
                          className="sm:col-span-2"
                          {...form.register(f.name)}
                        />
                      )
                    }
                    const reg = form.register(f.name)
                    return (
                      <Input
                        key={f.name}
                        label={f.label}
                        type={f.type === 'email' ? 'email' : 'text'}
                        inputMode={f.type === 'tel' ? 'tel' : undefined}
                        error={form.formState.errors[f.name]?.message as string | undefined}
                        {...reg}
                        onChange={(e) => {
                          // Phone/number fields: strip anything that isn't a
                          // digit or standard phone punctuation as they type.
                          if (f.type === 'tel') {
                            e.target.value = e.target.value.replace(/[^0-9+()\s-]/g, '')
                          }
                          reg.onChange(e)
                        }}
                      />
                    )
                  })}
                </div>
              ) : (
                (() => {
                  const read = member as unknown as Record<string, string | null>
                  const filled = group.fields.filter((f) => read[f.name])
                  if (filled.length === 0) {
                    return <p className="text-sm text-text-dim">Not provided yet</p>
                  }
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
                      {filled.map((f) => (
                        <DetailRow
                          key={f.name}
                          label={f.label}
                          value={read[f.name]}
                          className={f.long ? 'sm:col-span-2' : ''}
                        />
                      ))}
                    </div>
                  )
                })()
              )}
            </Section>
          ))}
        </CardContent>
      </Card>

      {/* Commercial value / ROI rollup (Feature #5) + relationship scores
          (Feature #4). Added alongside — not replacing — the free-text
          relationship-intelligence card above. */}
      {!editing && (
        <>
          <MemberRoiPanel memberId={member.id} />
          <MemberScoresPanel memberId={member.id} />
          <MemberRecommendationsPanel memberId={member.id} />
        </>
      )}

      {/* Representatives — business accounts (Business + Corporate plans)
          that hold the membership (not themselves a rep under another
          account). */}
      {!editing &&
        member.membership_type === 'business' &&
        !member.parent_member_id && (
          <div className="mb-6">
            <RepsPanel parentMemberId={member.id} companyName={member.company_name} />
          </div>
        )}

      {/* Rep notice — this member belongs to a parent business account. */}
      {!editing && member.parent_member_id && (
        <Card className="mb-6">
          <CardContent className="py-4 flex items-center justify-between gap-3">
            <p className="text-sm text-text-muted">
              This member is a representative under a business account.
            </p>
            <Link
              href={`/dashboard/members/${member.parent_member_id}`}
              className="text-sm text-gold hover:underline shrink-0"
            >
              Open business account →
            </Link>
          </CardContent>
        </Card>
      )}

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

      {/* Document vault — onboarding forms, agreements, NDAs (private storage) */}
      {!editing && <MemberDocumentsPanel memberId={member.id} />}

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
          <div className="space-y-4">
              {/* AI suggestions — polished panel */}
              <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border-gold bg-gradient-to-br from-gold-muted/70 via-surface to-surface p-4">
                {/* soft decorative glow */}
                <div className="pointer-events-none absolute -top-12 -right-10 h-32 w-32 rounded-full bg-gold/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-12 -left-8 h-24 w-24 rounded-full bg-gold-light/10 blur-3xl" />

                <div className="relative flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold-light to-gold text-white shadow-[0_4px_14px_rgba(184,151,90,0.4)]">
                      <Sparkles size={16} strokeWidth={1.75} className={cn(aiLoading && 'animate-pulse')} />
                    </div>
                    <div>
                      <p className="font-[family-name:var(--font-label)] text-[10px] font-semibold uppercase tracking-[0.22em] text-gold">
                        AI Suggestions
                      </p>
                      <p className="text-sm font-medium text-text leading-tight">Tags from this profile</p>
                      <p className="text-xs text-text-muted mt-0.5">
                        Smart picks from their bio, sector &amp; goals — each with a reason.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    icon={<Sparkles size={14} />}
                    onClick={runAiSuggestions}
                    loading={aiLoading}
                    className="shrink-0"
                  >
                    {aiRan ? 'Refresh' : 'Suggest'}
                  </Button>
                </div>

                {/* loading shimmer */}
                {aiLoading && (
                  <div className="relative mt-4 space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-[52px] rounded-[var(--radius-md)] border border-border bg-surface-2/70 animate-pulse"
                      />
                    ))}
                    <p className="flex items-center gap-1.5 text-xs text-gold mt-1">
                      <Sparkles size={12} className="animate-pulse" /> Reading the profile…
                    </p>
                  </div>
                )}

                {aiRan && !aiLoading && aiSuggestions.length === 0 && (
                  <p className="relative mt-3 text-xs text-text-dim italic">
                    No confident picks yet — add more profile detail, or choose tags below.
                  </p>
                )}

                {aiRan && !aiLoading && aiSuggestions.length > 0 && (
                  <div className="relative mt-4 space-y-2">
                    {aiSuggestions.map((s) => {
                      const selected = memberTagIds.includes(s.tag_id)
                      return (
                        <div
                          key={s.tag_id}
                          className="group flex items-start justify-between gap-3 rounded-[var(--radius-md)] bg-surface border border-border p-3 transition-shadow hover:shadow-[0_6px_18px_rgba(44,40,37,0.07)]"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-text">{s.name}</span>
                              <span
                                className={cn(
                                  'px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] rounded-full',
                                  CATEGORY_STYLES[s.category] ??
                                    'bg-gold-muted text-gold border border-border-gold',
                                )}
                              >
                                {CATEGORY_LABELS[s.category] ?? s.category}
                              </span>
                            </div>
                            <p className="text-xs text-text-muted leading-relaxed">{s.reason}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => !selected && toggleTag(s.tag_id)}
                            disabled={selected}
                            className={cn(
                              'shrink-0 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border font-medium transition-all',
                              selected
                                ? 'bg-gold text-white border-gold cursor-default'
                                : 'bg-surface text-gold border-border-gold hover:bg-gold hover:text-white hover:shadow-[0_3px_12px_rgba(184,151,90,0.35)]',
                            )}
                          >
                            {selected ? (
                              <>
                                <Check size={12} /> Added
                              </>
                            ) : (
                              <>
                                <Plus size={12} /> Add
                              </>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Quick-add a brand-new tag */}
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addQuickTag()
                    }
                  }}
                  placeholder="Create a new tag…"
                  className="flex-1 px-3 py-2 bg-surface text-text text-sm rounded-[var(--radius-md)] border border-border outline-none focus:border-gold"
                />
                <div className="sm:w-40">
                  <Select
                    options={[
                      { value: 'industry', label: 'Industry' },
                      { value: 'interest', label: 'Interest' },
                      { value: 'need', label: 'Looking For' },
                      { value: 'service', label: 'Service' },
                    ]}
                    value={newTagCategory}
                    onChange={(e) => setNewTagCategory(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Plus size={14} />}
                  onClick={addQuickTag}
                  loading={addingTag}
                  disabled={!newTagName.trim()}
                >
                  Add
                </Button>
              </div>

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
        </CardContent>
      </Card>

      {/* Suggested introductions (tag-matched) */}
      <MemberMatchesPanel memberId={id} memberName={memberFullName} refreshKey={refreshKey} />

      {/* Gmail conversation history + AI-drafted replies */}
      {!editing && <GmailThreadPanel memberId={member.id} />}

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
