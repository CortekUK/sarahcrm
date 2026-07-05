'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { StatCard } from '@/components/ui/StatCard'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { DateField } from '@/components/ui/DateField'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { ImageUpload } from '@/components/ui/ImageUpload'
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
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import {
  Loader2,
  Plus,
  Trash2,
  Gift,
  ChevronLeft,
  Tag,
  Package,
  Ticket,
  Users,
  Pencil,
} from 'lucide-react'
import type { Database } from '@/types/database'

type PartnerRow = Database['public']['Tables']['reward_partners']['Row']
type OfferRow = Database['public']['Tables']['reward_offers']['Row']
type ClaimRow = Database['public']['Tables']['reward_claims']['Row']
type ReferralRow = Database['public']['Tables']['reward_referrals']['Row']

// Claims come back with member + offer joined for display.
interface ClaimJoined extends ClaimRow {
  members: {
    member_number: number | null
    profiles: { first_name: string | null; last_name: string | null } | null
  } | null
  reward_offers: { title: string; partner_id: string } | null
}

interface MemberLite {
  id: string
  member_number: number | null
  first_name: string | null
  last_name: string | null
}

type Tab = 'partners' | 'claims' | 'referrals'

const CATEGORY_OPTIONS = [
  'Hotels',
  'Restaurants',
  'Golf',
  'Travel',
  'Luxury Retail',
  'Property',
  'Health & Wellness',
  'Business Services',
  'Automotive',
  'Watches & Jewellery',
  'Other',
].map((c) => ({ value: c, label: c }))

const CLAIM_STATUS_META: Record<
  string,
  { label: string; variant: 'active' | 'upcoming' | 'draft' | 'urgent' | 'info' }
> = {
  claimed: { label: 'Claimed', variant: 'info' },
  redeemed: { label: 'Redeemed', variant: 'active' },
  cancelled: { label: 'Cancelled', variant: 'urgent' },
}
const CLAIM_STATUS_OPTIONS = [
  { value: 'claimed', label: 'Claimed' },
  { value: 'redeemed', label: 'Redeemed' },
  { value: 'cancelled', label: 'Cancelled' },
]

const REFERRAL_STATUS_META: Record<
  string,
  { label: string; variant: 'active' | 'upcoming' | 'draft' | 'urgent' | 'info' }
> = {
  pending: { label: 'Pending', variant: 'upcoming' },
  paid: { label: 'Paid', variant: 'active' },
}
const REFERRAL_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
]

// Pounds string → integer pence (null when blank).
function poundsToPence(v: string): number | null {
  const cleaned = v.replace(/[£,\s]/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  if (Number.isNaN(n)) return null
  return Math.round(n * 100)
}
function penceToPounds(pence: number | null): string {
  if (pence == null) return ''
  return (pence / 100).toString()
}

function memberName(m: {
  first_name: string | null
  last_name: string | null
} | null | undefined): string {
  if (!m) return '—'
  return `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Unnamed'
}

function memberLabel(m: MemberLite): string {
  const name = memberName(m)
  return m.member_number != null ? `#${m.member_number} · ${name}` : name
}

// Simple form toggle for booleans inside modals.
function FormToggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        'flex items-center justify-between w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border text-sm transition-colors',
        value ? 'border-gold bg-gold-muted text-text' : 'border-border bg-surface text-text-muted',
      )}
      aria-pressed={value}
    >
      <span>{label}</span>
      <span
        className={cn(
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
          value ? 'bg-gold' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
            value ? 'translate-x-4' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  )
}

const emptyPartner = {
  name: '',
  category: 'Hotels',
  description: '',
  logo_url: '',
  website_url: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
  is_active: true,
  is_public: false,
}

const emptyOffer = {
  title: '',
  summary: '',
  details: '',
  member_benefit: '',
  redemption_process: '',
  booking_url: '',
  discount_code: '',
  is_active: true,
  valid_until: '',
}

const emptyReferral = {
  member_id: '',
  description: '',
  referred_name: '',
  revenue: '',
  commission: '',
  status: 'pending',
}

const emptyClaim = {
  status: 'claimed',
  value: '',
  notes: '',
}

export function RewardsPage() {
  const confirm = useConfirm()

  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [offers, setOffers] = useState<OfferRow[]>([])
  const [claims, setClaims] = useState<ClaimJoined[]>([])
  const [referrals, setReferrals] = useState<ReferralRow[]>([])
  const [members, setMembers] = useState<MemberLite[]>([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState<Tab>('partners')
  // When set, the Partners tab drills into a single partner's offers.
  const [offersFor, setOffersFor] = useState<PartnerRow | null>(null)

  // Partner modal
  const [partnerModal, setPartnerModal] = useState(false)
  const [editingPartner, setEditingPartner] = useState<string | null>(null)
  const [partnerForm, setPartnerForm] = useState({ ...emptyPartner })
  const [savingPartner, setSavingPartner] = useState(false)

  // Offer modal
  const [offerModal, setOfferModal] = useState(false)
  const [editingOffer, setEditingOffer] = useState<string | null>(null)
  const [offerForm, setOfferForm] = useState({ ...emptyOffer })
  const [savingOffer, setSavingOffer] = useState(false)

  // Claim modal
  const [claimModal, setClaimModal] = useState(false)
  const [editingClaim, setEditingClaim] = useState<ClaimJoined | null>(null)
  const [claimForm, setClaimForm] = useState({ ...emptyClaim })
  const [savingClaim, setSavingClaim] = useState(false)

  // Referral modal
  const [referralModal, setReferralModal] = useState(false)
  const [editingReferral, setEditingReferral] = useState<string | null>(null)
  const [referralForm, setReferralForm] = useState({ ...emptyReferral })
  const [savingReferral, setSavingReferral] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [partnersRes, offersRes, claimsRes, referralsRes, membersRes] = await Promise.all([
      supabase
        .from('reward_partners')
        .select('*')
        .order('display_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('reward_offers')
        .select('*')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false }),
      supabase
        .from('reward_claims')
        .select(
          '*, members(member_number, profiles(first_name, last_name)), reward_offers(title, partner_id)',
        )
        .order('claimed_at', { ascending: false }),
      supabase
        .from('reward_referrals')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('members').select('id, member_number, profiles(first_name, last_name)').is('deleted_at', null),
    ])
    if (partnersRes.data) setPartners(partnersRes.data)
    if (offersRes.data) setOffers(offersRes.data)
    if (claimsRes.data) setClaims(claimsRes.data as unknown as ClaimJoined[])
    if (referralsRes.data) setReferrals(referralsRes.data)
    if (membersRes.data) {
      setMembers(
        membersRes.data.map((m) => {
          const p = (m as { profiles: { first_name: string | null; last_name: string | null } | null }).profiles
          return {
            id: m.id,
            member_number: (m as { member_number: number | null }).member_number,
            first_name: p?.first_name ?? null,
            last_name: p?.last_name ?? null,
          }
        }),
      )
    }
    setLoading(false)
  }

  const partnerById = useMemo(() => {
    const map: Record<string, PartnerRow> = {}
    for (const p of partners) map[p.id] = p
    return map
  }, [partners])

  const offerCountByPartner = useMemo(() => {
    const map: Record<string, number> = {}
    for (const o of offers) map[o.partner_id] = (map[o.partner_id] ?? 0) + 1
    return map
  }, [offers])

  // ── Reporting stats ──────────────────────────────────────
  const stats = useMemo(() => {
    const totalPartners = partners.length
    const activeOffers = offers.filter((o) => o.is_active).length
    const totalClaims = claims.length
    const redeemed = claims.filter((c) => c.status === 'redeemed').length
    let commissionOwed = 0
    let commissionPaid = 0
    for (const r of referrals) {
      if (r.status === 'pending') commissionOwed += r.commission_pence ?? 0
      if (r.status === 'paid') commissionPaid += r.commission_pence ?? 0
    }
    return { totalPartners, activeOffers, totalClaims, redeemed, commissionOwed, commissionPaid }
  }, [partners, offers, claims, referrals])

  // Top partners by claim count.
  const popularPartners = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of claims) {
      const pid = c.reward_offers?.partner_id
      if (pid) counts[pid] = (counts[pid] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([pid, count]) => ({ partner: partnerById[pid], count }))
      .filter((x) => x.partner)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [claims, partnerById])

  // ── Partner CRUD ─────────────────────────────────────────
  function openNewPartner() {
    setEditingPartner(null)
    setPartnerForm({ ...emptyPartner })
    setPartnerModal(true)
  }
  function openEditPartner(p: PartnerRow) {
    setEditingPartner(p.id)
    setPartnerForm({
      name: p.name,
      category: p.category,
      description: p.description ?? '',
      logo_url: p.logo_url ?? '',
      website_url: p.website_url ?? '',
      contact_name: p.contact_name ?? '',
      contact_email: p.contact_email ?? '',
      contact_phone: p.contact_phone ?? '',
      is_active: p.is_active,
      is_public: p.is_public,
    })
    setPartnerModal(true)
  }
  async function savePartner() {
    const name = partnerForm.name.trim()
    if (!name) {
      toast({ title: 'Name required', variant: 'destructive' })
      return
    }
    setSavingPartner(true)
    const payload = {
      name,
      category: partnerForm.category,
      description: partnerForm.description.trim() || null,
      logo_url: partnerForm.logo_url.trim() || null,
      website_url: partnerForm.website_url.trim() || null,
      contact_name: partnerForm.contact_name.trim() || null,
      contact_email: partnerForm.contact_email.trim() || null,
      contact_phone: partnerForm.contact_phone.trim() || null,
      is_active: partnerForm.is_active,
      is_public: partnerForm.is_public,
    }
    const res = editingPartner
      ? await supabase.from('reward_partners').update(payload).eq('id', editingPartner)
      : await supabase.from('reward_partners').insert(payload)
    setSavingPartner(false)
    if (res.error) {
      toast({ title: 'Could not save partner', description: res.error.message, variant: 'destructive' })
      return
    }
    toast({ title: editingPartner ? 'Partner updated' : 'Partner created' })
    setPartnerModal(false)
    load()
  }
  async function deletePartner() {
    if (!editingPartner) return
    const ok = await confirm({
      title: 'Delete this partner?',
      description: 'The partner and all its offers are permanently removed. This cannot be undone.',
      confirmLabel: 'Delete partner',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('reward_partners').delete().eq('id', editingPartner)
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
      return
    }
    setPartnerModal(false)
    toast({ title: 'Partner deleted' })
    load()
  }

  // ── Offer CRUD ───────────────────────────────────────────
  function openNewOffer() {
    setEditingOffer(null)
    setOfferForm({ ...emptyOffer })
    setOfferModal(true)
  }
  function openEditOffer(o: OfferRow) {
    setEditingOffer(o.id)
    setOfferForm({
      title: o.title,
      summary: o.summary ?? '',
      details: o.details ?? '',
      member_benefit: o.member_benefit ?? '',
      redemption_process: o.redemption_process ?? '',
      booking_url: o.booking_url ?? '',
      discount_code: o.discount_code ?? '',
      is_active: o.is_active,
      valid_until: o.valid_until ?? '',
    })
    setOfferModal(true)
  }
  async function saveOffer() {
    if (!offersFor) return
    const title = offerForm.title.trim()
    if (!title) {
      toast({ title: 'Title required', variant: 'destructive' })
      return
    }
    setSavingOffer(true)
    const payload = {
      partner_id: offersFor.id,
      title,
      summary: offerForm.summary.trim() || null,
      details: offerForm.details.trim() || null,
      member_benefit: offerForm.member_benefit.trim() || null,
      redemption_process: offerForm.redemption_process.trim() || null,
      booking_url: offerForm.booking_url.trim() || null,
      discount_code: offerForm.discount_code.trim() || null,
      is_active: offerForm.is_active,
      valid_until: offerForm.valid_until || null,
    }
    const res = editingOffer
      ? await supabase.from('reward_offers').update(payload).eq('id', editingOffer)
      : await supabase.from('reward_offers').insert(payload)
    setSavingOffer(false)
    if (res.error) {
      toast({ title: 'Could not save offer', description: res.error.message, variant: 'destructive' })
      return
    }
    toast({ title: editingOffer ? 'Offer updated' : 'Offer created' })
    setOfferModal(false)
    load()
  }
  async function deleteOffer() {
    if (!editingOffer) return
    const ok = await confirm({
      title: 'Delete this offer?',
      description: 'The offer is permanently removed. This cannot be undone.',
      confirmLabel: 'Delete offer',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('reward_offers').delete().eq('id', editingOffer)
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
      return
    }
    setOfferModal(false)
    toast({ title: 'Offer deleted' })
    load()
  }

  // ── Claim edit ───────────────────────────────────────────
  function openEditClaim(c: ClaimJoined) {
    setEditingClaim(c)
    setClaimForm({
      status: c.status,
      value: penceToPounds(c.value_pence),
      notes: c.notes ?? '',
    })
    setClaimModal(true)
  }
  async function saveClaim() {
    if (!editingClaim) return
    setSavingClaim(true)
    const payload = {
      status: claimForm.status,
      value_pence: poundsToPence(claimForm.value),
      notes: claimForm.notes.trim() || null,
      redeemed_at:
        claimForm.status === 'redeemed'
          ? editingClaim.redeemed_at ?? new Date().toISOString()
          : null,
    }
    const { error } = await supabase.from('reward_claims').update(payload).eq('id', editingClaim.id)
    setSavingClaim(false)
    if (error) {
      toast({ title: 'Could not save claim', description: error.message, variant: 'destructive' })
      return
    }
    toast({ title: 'Claim updated' })
    setClaimModal(false)
    load()
  }
  async function quickClaimStatus(c: ClaimJoined, status: string) {
    const redeemed_at =
      status === 'redeemed' ? c.redeemed_at ?? new Date().toISOString() : null
    setClaims((prev) => prev.map((x) => (x.id === c.id ? { ...x, status, redeemed_at } : x)))
    const { error } = await supabase
      .from('reward_claims')
      .update({ status, redeemed_at })
      .eq('id', c.id)
    if (error) {
      toast({ title: 'Could not update status', description: error.message, variant: 'destructive' })
      load()
    }
  }

  // ── Referral CRUD ────────────────────────────────────────
  function openNewReferral() {
    setEditingReferral(null)
    setReferralForm({ ...emptyReferral, member_id: members[0]?.id ?? '' })
    setReferralModal(true)
  }
  function openEditReferral(r: ReferralRow) {
    setEditingReferral(r.id)
    setReferralForm({
      member_id: r.member_id,
      description: r.description ?? '',
      referred_name: r.referred_name ?? '',
      revenue: penceToPounds(r.revenue_pence),
      commission: penceToPounds(r.commission_pence),
      status: r.status,
    })
    setReferralModal(true)
  }
  async function saveReferral() {
    if (!referralForm.member_id) {
      toast({ title: 'Member required', variant: 'destructive' })
      return
    }
    setSavingReferral(true)
    const payload = {
      member_id: referralForm.member_id,
      description: referralForm.description.trim() || null,
      referred_name: referralForm.referred_name.trim() || null,
      revenue_pence: poundsToPence(referralForm.revenue),
      commission_pence: poundsToPence(referralForm.commission),
      status: referralForm.status,
    }
    const res = editingReferral
      ? await supabase.from('reward_referrals').update(payload).eq('id', editingReferral)
      : await supabase.from('reward_referrals').insert(payload)
    setSavingReferral(false)
    if (res.error) {
      toast({ title: 'Could not save referral', description: res.error.message, variant: 'destructive' })
      return
    }
    toast({ title: editingReferral ? 'Referral updated' : 'Referral created' })
    setReferralModal(false)
    load()
  }
  async function deleteReferral() {
    if (!editingReferral) return
    const ok = await confirm({
      title: 'Delete this referral?',
      description: 'The referral is permanently removed. This cannot be undone.',
      confirmLabel: 'Delete referral',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('reward_referrals').delete().eq('id', editingReferral)
    if (error) {
      toast({ title: 'Could not delete', description: error.message, variant: 'destructive' })
      return
    }
    setReferralModal(false)
    toast({ title: 'Referral deleted' })
    load()
  }

  const partnerOffers = useMemo(
    () => (offersFor ? offers.filter((o) => o.partner_id === offersFor.id) : []),
    [offers, offersFor],
  )

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading rewards…
      </div>
    )
  }

  const TABS: { value: Tab; label: string }[] = [
    { value: 'partners', label: 'Partners & offers' },
    { value: 'claims', label: 'Claims' },
    { value: 'referrals', label: 'Referrals' },
  ]

  return (
    <div className="p-8">
      <AdminPageHeader
        title="Rewards & Benefits"
        description="Partner directory, member offers, redemption tracking and the referral commission ledger — the whole benefits programme in one place."
        actions={
          !offersFor && tab === 'partners' ? (
            <Button icon={<Plus size={15} />} onClick={openNewPartner}>
              New partner
            </Button>
          ) : tab === 'referrals' ? (
            <Button icon={<Plus size={15} />} onClick={openNewReferral}>
              New referral
            </Button>
          ) : undefined
        }
      />

      {/* Reporting tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-5 mb-6">
        <StatCard label="Partners" value={stats.totalPartners} changeText="in directory" changeType="neutral" />
        <StatCard label="Active offers" value={stats.activeOffers} changeText="live to members" changeType="positive" />
        <StatCard label="Claims" value={stats.totalClaims} changeText="lodged to date" changeType="neutral" />
        <StatCard label="Redeemed" value={stats.redeemed} changeText="fulfilled" changeType="positive" />
        <StatCard
          label="Commission owed"
          value={formatCurrency(stats.commissionOwed)}
          changeText={`${formatCurrency(stats.commissionPaid)} paid`}
          changeType={stats.commissionOwed > 0 ? 'negative' : 'positive'}
        />
      </div>

      {/* Tab bar */}
      {!offersFor && (
        <div className="flex items-center gap-1 mb-6 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.value
                  ? 'border-gold text-text'
                  : 'border-transparent text-text-muted hover:text-text',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── PARTNERS TAB ── */}
      {tab === 'partners' && !offersFor && (
        <>
          <Card className="mb-6">
            <CardContent className="p-0">
              {partners.length === 0 ? (
                <div className="py-16">
                  <AdminEmptyState
                    icon={Gift}
                    title="No partners yet"
                    description="Add a rewards partner to start building the benefits directory — hotels, restaurants, travel and more."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Partner</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Offers</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partners.map((p) => (
                      <TableRow
                        key={p.id}
                        className="cursor-pointer"
                        onClick={() => openEditPartner(p)}
                      >
                        <TableCell className="max-w-[320px]">
                          <div className="flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {p.logo_url ? (
                              <img
                                src={p.logo_url}
                                alt=""
                                className="w-9 h-9 rounded-[var(--radius-md)] object-cover bg-surface-2 shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-[var(--radius-md)] bg-surface-2 flex items-center justify-center shrink-0">
                                <Tag size={15} className="text-text-dim" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-text truncate">{p.name}</p>
                              {p.contact_name && (
                                <p className="text-xs text-text-dim truncate">{p.contact_name}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-text-muted">{p.category}</TableCell>
                        <TableCell className="text-text-muted tabular-nums">
                          {offerCountByPartner[p.id] ?? 0}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant={p.is_active ? 'active' : 'draft'}>
                              {p.is_active ? 'Active' : 'Inactive'}
                            </Badge>
                            {p.is_public && <Badge variant="info">Public</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Package size={13} />}
                            onClick={() => setOffersFor(p)}
                          >
                            Manage offers
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Most popular partners */}
          {popularPartners.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-text-dim mb-4">
                  Most popular partners
                </p>
                <div className="space-y-3">
                  {popularPartners.map(({ partner, count }) => (
                    <div key={partner!.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-text font-medium truncate">{partner!.name}</span>
                        <span className="text-xs text-text-dim">{partner!.category}</span>
                      </div>
                      <span className="text-sm text-text-muted tabular-nums shrink-0">
                        {count} {count === 1 ? 'claim' : 'claims'}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── OFFERS DRILL-DOWN ── */}
      {offersFor && (
        <>
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setOffersFor(null)}
              className="inline-flex items-center gap-1 px-2 py-1 -ml-2 rounded hover:bg-surface-2 transition-colors text-sm text-text-muted hover:text-text"
            >
              <ChevronLeft size={15} />
              Back to partners
            </button>
            <Button icon={<Plus size={15} />} onClick={openNewOffer}>
              New offer
            </Button>
          </div>
          <div className="mb-4">
            <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text">
              {offersFor.name} · offers
            </h2>
            <p className="text-sm text-text-muted mt-0.5">{offersFor.category}</p>
          </div>
          <Card>
            <CardContent className="p-0">
              {partnerOffers.length === 0 ? (
                <div className="py-16">
                  <AdminEmptyState
                    icon={Package}
                    title="No offers for this partner"
                    description="Create an offer to make this partner's benefit available to members."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Offer</TableHead>
                      <TableHead>Member benefit</TableHead>
                      <TableHead>Valid until</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partnerOffers.map((o) => (
                      <TableRow key={o.id} className="cursor-pointer" onClick={() => openEditOffer(o)}>
                        <TableCell className="max-w-[320px]">
                          <p className="font-medium text-text truncate">{o.title}</p>
                          {o.summary && <p className="text-xs text-text-dim truncate">{o.summary}</p>}
                        </TableCell>
                        <TableCell className="text-text-muted max-w-[240px] truncate">
                          {o.member_benefit || '—'}
                        </TableCell>
                        <TableCell className="text-text-muted">
                          {o.valid_until ? formatDate(o.valid_until) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={o.is_active ? 'active' : 'draft'}>
                            {o.is_active ? 'Active' : 'Inactive'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── CLAIMS TAB ── */}
      {tab === 'claims' && !offersFor && (
        <Card>
          <CardContent className="p-0">
            {claims.length === 0 ? (
              <div className="py-16">
                <AdminEmptyState
                  icon={Ticket}
                  title="No claims yet"
                  description="When members claim a reward offer it appears here to track through to redemption."
                />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Member</TableHead>
                    <TableHead>Offer</TableHead>
                    <TableHead>Claimed</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {claims.map((c) => {
                    const partner = c.reward_offers ? partnerById[c.reward_offers.partner_id] : undefined
                    return (
                      <TableRow key={c.id} className="cursor-pointer group" onClick={() => openEditClaim(c)}>
                        <TableCell>
                          <p className="font-medium text-text">{memberName(c.members?.profiles)}</p>
                          {c.members?.member_number != null && (
                            <p className="text-xs text-text-dim">#{c.members.member_number}</p>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <p className="text-text truncate">{c.reward_offers?.title ?? '—'}</p>
                          {partner && <p className="text-xs text-text-dim truncate">{partner.name}</p>}
                        </TableCell>
                        <TableCell className="text-text-muted">{formatDate(c.claimed_at)}</TableCell>
                        <TableCell className="text-right tabular-nums text-text">
                          {c.value_pence != null ? (
                            formatCurrency(c.value_pence)
                          ) : (
                            <span className="text-text-dim italic normal-case">Set value</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <SelectMenu
                            size="sm"
                            ariaLabel="Change claim status"
                            value={c.status}
                            onValueChange={(v) => quickClaimStatus(c, v)}
                            options={CLAIM_STATUS_OPTIONS}
                            className="w-36"
                          />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Pencil size={13} />}
                            onClick={() => openEditClaim(c)}
                          >
                            Edit value
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── REFERRALS TAB ── */}
      {tab === 'referrals' && !offersFor && (
        <>
          <div className="grid grid-cols-2 gap-5 mb-6">
            <StatCard
              label="Commission owed"
              value={formatCurrency(stats.commissionOwed)}
              changeText="pending payout"
              changeType={stats.commissionOwed > 0 ? 'negative' : 'positive'}
            />
            <StatCard
              label="Commission paid"
              value={formatCurrency(stats.commissionPaid)}
              changeText="settled to date"
              changeType="positive"
            />
          </div>
          <Card>
            <CardContent className="p-0">
              {referrals.length === 0 ? (
                <div className="py-16">
                  <AdminEmptyState
                    icon={Users}
                    title="No referrals logged"
                    description="Record a member referral to track revenue and the commission owed back to them."
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Referrer</TableHead>
                      <TableHead>Referred</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {referrals.map((r) => {
                      const m = members.find((x) => x.id === r.member_id)
                      return (
                        <TableRow key={r.id} className="cursor-pointer" onClick={() => openEditReferral(r)}>
                          <TableCell>
                            <p className="font-medium text-text">{memberName(m)}</p>
                            {m?.member_number != null && (
                              <p className="text-xs text-text-dim">#{m.member_number}</p>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[280px]">
                            <p className="text-text truncate">{r.referred_name || '—'}</p>
                            {r.description && <p className="text-xs text-text-dim truncate">{r.description}</p>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-text-muted">
                            {r.revenue_pence != null ? formatCurrency(r.revenue_pence) : '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-text">
                            {r.commission_pence != null ? formatCurrency(r.commission_pence) : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={REFERRAL_STATUS_META[r.status]?.variant ?? 'draft'}>
                              {REFERRAL_STATUS_META[r.status]?.label ?? r.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── PARTNER MODAL ── */}
      <Modal
        open={partnerModal}
        onClose={() => setPartnerModal(false)}
        title={editingPartner ? 'Edit partner' : 'New partner'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Name"
              placeholder="e.g. The Ned"
              value={partnerForm.name}
              onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })}
            />
            <SelectMenu
              label="Category"
              value={partnerForm.category}
              onValueChange={(v) => setPartnerForm({ ...partnerForm, category: v })}
              options={CATEGORY_OPTIONS}
            />
          </div>
          <Textarea
            label="Description"
            placeholder="A short description of the partner."
            value={partnerForm.description}
            onChange={(e) => setPartnerForm({ ...partnerForm, description: e.target.value })}
            rows={2}
          />
          <ImageUpload
            label="Logo"
            value={partnerForm.logo_url}
            onChange={(url) => setPartnerForm({ ...partnerForm, logo_url: url ?? '' })}
            bucket="logos"
            folder="reward-partners"
          />
          <Input
            label="Website URL"
            placeholder="https://…"
            value={partnerForm.website_url}
            onChange={(e) => setPartnerForm({ ...partnerForm, website_url: e.target.value })}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Contact name"
              value={partnerForm.contact_name}
              onChange={(e) => setPartnerForm({ ...partnerForm, contact_name: e.target.value })}
            />
            <Input
              label="Contact email"
              type="email"
              value={partnerForm.contact_email}
              onChange={(e) => setPartnerForm({ ...partnerForm, contact_email: e.target.value })}
            />
            <Input
              label="Contact phone"
              value={partnerForm.contact_phone}
              onChange={(e) => setPartnerForm({ ...partnerForm, contact_phone: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormToggle
              label="Active"
              value={partnerForm.is_active}
              onChange={(v) => setPartnerForm({ ...partnerForm, is_active: v })}
            />
            <FormToggle
              label="Public"
              value={partnerForm.is_public}
              onChange={(v) => setPartnerForm({ ...partnerForm, is_public: v })}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            {editingPartner ? (
              <Button variant="ghost" icon={<Trash2 size={14} />} className="text-accent-warm" onClick={deletePartner}>
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setPartnerModal(false)}>
                Cancel
              </Button>
              <Button loading={savingPartner} onClick={savePartner}>
                {editingPartner ? 'Save changes' : 'Create partner'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── OFFER MODAL ── */}
      <Modal
        open={offerModal}
        onClose={() => setOfferModal(false)}
        title={editingOffer ? 'Edit offer' : 'New offer'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Title"
            placeholder="e.g. Complimentary room upgrade"
            value={offerForm.title}
            onChange={(e) => setOfferForm({ ...offerForm, title: e.target.value })}
          />
          <Textarea
            label="Summary (public teaser)"
            placeholder="Short public-facing teaser."
            value={offerForm.summary}
            onChange={(e) => setOfferForm({ ...offerForm, summary: e.target.value })}
            rows={2}
          />
          <Textarea
            label="Details (member-only)"
            placeholder="Full detail shown to members."
            value={offerForm.details}
            onChange={(e) => setOfferForm({ ...offerForm, details: e.target.value })}
            rows={3}
          />
          <Textarea
            label="Member benefit"
            placeholder="What the member gets — the headline benefit."
            value={offerForm.member_benefit}
            onChange={(e) => setOfferForm({ ...offerForm, member_benefit: e.target.value })}
            rows={2}
          />
          <Textarea
            label="Redemption process"
            placeholder="How the member redeems this offer."
            value={offerForm.redemption_process}
            onChange={(e) => setOfferForm({ ...offerForm, redemption_process: e.target.value })}
            rows={2}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Booking URL"
              placeholder="https://…"
              value={offerForm.booking_url}
              onChange={(e) => setOfferForm({ ...offerForm, booking_url: e.target.value })}
            />
            <Input
              label="Discount code (member-only)"
              value={offerForm.discount_code}
              onChange={(e) => setOfferForm({ ...offerForm, discount_code: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DateField
              label="Valid until"
              value={offerForm.valid_until}
              onChange={(v) => setOfferForm({ ...offerForm, valid_until: v })}
            />
            <FormToggle
              label="Active"
              value={offerForm.is_active}
              onChange={(v) => setOfferForm({ ...offerForm, is_active: v })}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            {editingOffer ? (
              <Button variant="ghost" icon={<Trash2 size={14} />} className="text-accent-warm" onClick={deleteOffer}>
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOfferModal(false)}>
                Cancel
              </Button>
              <Button loading={savingOffer} onClick={saveOffer}>
                {editingOffer ? 'Save changes' : 'Create offer'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ── CLAIM MODAL ── */}
      <Modal
        open={claimModal}
        onClose={() => setClaimModal(false)}
        title="Claim"
        size="md"
      >
        {editingClaim && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-surface-2 p-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.1em] text-text-dim mb-1">Member</p>
                  <p className="text-sm text-text">
                    {memberName(editingClaim.members?.profiles)}
                    {editingClaim.members?.member_number != null && (
                      <span className="text-text-dim"> · #{editingClaim.members.member_number}</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.1em] text-text-dim mb-1">Claimed</p>
                  <p className="text-sm text-text">{formatDate(editingClaim.claimed_at)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-text-dim mb-1">Offer</p>
                  <p className="text-sm text-text">{editingClaim.reward_offers?.title ?? '—'}</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SelectMenu
                label="Status"
                value={claimForm.status}
                onValueChange={(v) => setClaimForm({ ...claimForm, status: v })}
                options={CLAIM_STATUS_OPTIONS}
              />
              <Input
                label="Value (£)"
                placeholder="Value of the benefit"
                value={claimForm.value}
                onChange={(e) => setClaimForm({ ...claimForm, value: e.target.value })}
              />
            </div>
            <Textarea
              label="Notes"
              value={claimForm.notes}
              onChange={(e) => setClaimForm({ ...claimForm, notes: e.target.value })}
              rows={2}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setClaimModal(false)}>
                Cancel
              </Button>
              <Button loading={savingClaim} onClick={saveClaim}>
                Save changes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── REFERRAL MODAL ── */}
      <Modal
        open={referralModal}
        onClose={() => setReferralModal(false)}
        title={editingReferral ? 'Edit referral' : 'New referral'}
        size="md"
      >
        <div className="space-y-4">
          <SelectMenu
            label="Referring member"
            value={referralForm.member_id || 'none'}
            onValueChange={(v) => setReferralForm({ ...referralForm, member_id: v === 'none' ? '' : v })}
            options={[
              { value: 'none', label: 'Select a member…' },
              ...members.map((m) => ({ value: m.id, label: memberLabel(m) })),
            ]}
          />
          <Input
            label="Referred name"
            placeholder="Who was referred"
            value={referralForm.referred_name}
            onChange={(e) => setReferralForm({ ...referralForm, referred_name: e.target.value })}
          />
          <Textarea
            label="Description"
            placeholder="What the referral was for."
            value={referralForm.description}
            onChange={(e) => setReferralForm({ ...referralForm, description: e.target.value })}
            rows={2}
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Revenue (£)"
              value={referralForm.revenue}
              onChange={(e) => setReferralForm({ ...referralForm, revenue: e.target.value })}
            />
            <Input
              label="Commission (£)"
              value={referralForm.commission}
              onChange={(e) => setReferralForm({ ...referralForm, commission: e.target.value })}
            />
            <SelectMenu
              label="Status"
              value={referralForm.status}
              onValueChange={(v) => setReferralForm({ ...referralForm, status: v })}
              options={REFERRAL_STATUS_OPTIONS}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            {editingReferral ? (
              <Button variant="ghost" icon={<Trash2 size={14} />} className="text-accent-warm" onClick={deleteReferral}>
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setReferralModal(false)}>
                Cancel
              </Button>
              <Button loading={savingReferral} onClick={saveReferral}>
                {editingReferral ? 'Save changes' : 'Create referral'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}
