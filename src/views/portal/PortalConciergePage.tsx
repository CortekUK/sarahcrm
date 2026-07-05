'use client'

import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { formatCurrency, formatDate } from '@/lib/utils'
import { BellRing, Check, Send } from 'lucide-react'
import {
  PortalBadge,
  PortalButton,
  PortalCard,
  PortalEmptyState,
  PortalField,
  PortalInput,
  PortalLoading,
  PortalPageHeader,
  PortalSectionTitle,
  PortalTextarea,
  type PortalBadgeVariant,
} from '@/components/portal/PortalChrome'
import { PortalSelect } from '@/components/portal/PortalSelect'

// ── Member-safe row shape ────────────────────────────────────────────
// CRITICAL: the member SELECT RLS returns the WHOLE row, and this reads
// via the browser client — so we MUST project only member-safe columns.
// Supplier / cost / sale price / commission / internal notes / owner are
// NEVER selected here, so they can never reach the browser.
const MEMBER_SAFE_COLUMNS =
  'id, request_type, description, event_name, location, dates, guests, budget_pence, quoted_amount_pence, status, created_at'

interface SafeRequest {
  id: string
  request_type: string
  description: string | null
  event_name: string | null
  location: string | null
  dates: string | null
  guests: number | null
  budget_pence: number | null
  quoted_amount_pence: number | null
  status: string
  created_at: string
}

const REQUEST_TYPES = [
  'Travel',
  'Holidays',
  'Private Events',
  'Luxury Goods',
  'Fashion',
  'Sports & Events Tickets',
  'Private Aviation',
  'Transfers',
  'Private Lounges',
  'Venue Finding',
  'Other',
]

// Member-facing status — deliberately coarse. The internal pipeline has
// ten states; members see a simple, reassuring version of where things
// are, and never the commercial mechanics behind them.
const STATUS_META: Record<string, { label: string; variant: PortalBadgeVariant }> = {
  pending: { label: 'Received', variant: 'neutral' },
  assigned: { label: 'In progress', variant: 'info' },
  sourcing: { label: 'Sourcing', variant: 'info' },
  quoted: { label: 'Quote ready', variant: 'upcoming' },
  accepted: { label: 'Confirmed', variant: 'upcoming' },
  booked: { label: 'Booked', variant: 'active' },
  delivered: { label: 'Delivered', variant: 'active' },
  feedback: { label: 'Complete', variant: 'active' },
  declined: { label: 'Declined', variant: 'urgent' },
  cancelled: { label: 'Cancelled', variant: 'urgent' },
}

const requestSchema = z.object({
  request_type: z.string().min(1, 'Please choose a type'),
  description: z.string().min(1, 'Tell us what you need'),
  event_name: z.string().optional(),
  location: z.string().optional(),
  dates: z.string().optional(),
  guests: z.string().optional(),
  budget: z.string().optional(),
})

type RequestFormData = z.infer<typeof requestSchema>

function poundsToPence(v: string | undefined): number | null {
  if (!v) return null
  const cleaned = v.replace(/[£,\s]/g, '').trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  if (Number.isNaN(n)) return null
  return Math.round(n * 100)
}

export function PortalConciergePage() {
  const { user } = useAuth()
  const [memberId, setMemberId] = useState<string | null>(null)
  const [requests, setRequests] = useState<SafeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: { request_type: 'Travel' },
  })

  useEffect(() => {
    if (user?.id) init(user.id)
  }, [user?.id])

  async function init(userId: string) {
    setLoading(true)
    const { data: me } = await supabase
      .from('members')
      .select('id')
      .eq('profile_id', userId)
      .maybeSingle()
    if (me) {
      setMemberId(me.id)
      await loadRequests(me.id)
    }
    setLoading(false)
  }

  async function loadRequests(mid: string) {
    const { data } = await supabase
      .from('concierge_requests')
      .select(MEMBER_SAFE_COLUMNS)
      .eq('member_id', mid)
      .order('created_at', { ascending: false })
    if (data) setRequests(data as unknown as SafeRequest[])
  }

  async function onSubmit(data: RequestFormData) {
    if (!memberId) return
    setSubmitting(true)
    setSubmitted(false)
    setError(null)

    const guests = data.guests?.trim() ? parseInt(data.guests, 10) : null
    const { error: insertError } = await supabase.from('concierge_requests').insert({
      member_id: memberId,
      request_type: data.request_type,
      description: data.description.trim(),
      event_name: data.event_name?.trim() || null,
      location: data.location?.trim() || null,
      dates: data.dates?.trim() || null,
      guests: guests != null && !Number.isNaN(guests) ? guests : null,
      budget_pence: poundsToPence(data.budget),
      status: 'pending',
    })

    setSubmitting(false)
    if (insertError) {
      setError('We could not submit your request. Please try again.')
      return
    }
    setSubmitted(true)
    reset({ request_type: 'Travel', description: '', event_name: '', location: '', dates: '', guests: '', budget: '' })
    await loadRequests(memberId)
    setTimeout(() => setSubmitted(false), 4000)
  }

  if (loading) {
    return (
      <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-12">
        <PortalLoading label="Loading concierge" />
      </div>
    )
  }

  return (
    <div className="max-w-[1000px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
      <PortalPageHeader
        eyebrow="Concierge"
        title="At your service."
        subtitle="Travel, tickets, private events, luxury goods — tell us what you're after and we'll take it from there."
      />

      {/* Request form */}
      <PortalCard className="p-6 lg:p-8 mb-10">
        <PortalSectionTitle eyebrow="New request">Make a request.</PortalSectionTitle>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <PortalField label="What do you need" error={errors.request_type?.message}>
              <Controller
                name="request_type"
                control={control}
                render={({ field }) => (
                  <PortalSelect
                    value={field.value}
                    onChange={field.onChange}
                    options={REQUEST_TYPES}
                    placeholder="Choose a type"
                  />
                )}
              />
            </PortalField>
            <PortalField label="Occasion / event" hint="Optional — e.g. anniversary, Wimbledon">
              <PortalInput {...register('event_name')} />
            </PortalField>
          </div>

          <PortalField label="Tell us more" error={errors.description?.message}>
            <PortalTextarea
              rows={4}
              placeholder="The details that matter — what you're looking for, any preferences."
              {...register('description')}
            />
          </PortalField>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <PortalField label="Location">
              <PortalInput placeholder="e.g. London, Monaco" {...register('location')} />
            </PortalField>
            <PortalField label="Dates">
              <PortalInput placeholder="e.g. 12–14 July" {...register('dates')} />
            </PortalField>
            <PortalField label="Guests">
              <PortalInput type="number" placeholder="e.g. 4" {...register('guests')} />
            </PortalField>
            <PortalField label="Budget" hint="Optional — helps us tailor the options.">
              <PortalInput placeholder="e.g. £5,000" {...register('budget')} />
            </PortalField>
          </div>

          {error && <p className="text-[12.5px] text-rose-300 italic">{error}</p>}

          <div className="flex items-center justify-end gap-5 pt-1">
            {submitted && (
              <span className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-emerald-300">
                <Check size={13} strokeWidth={2} />
                Request sent
              </span>
            )}
            <PortalButton type="submit" icon={<Send size={13} strokeWidth={1.5} />} loading={submitting}>
              Send request
            </PortalButton>
          </div>
        </form>
      </PortalCard>

      {/* Member's own requests */}
      <PortalSectionTitle eyebrow="Your requests">Where things stand.</PortalSectionTitle>
      {requests.length === 0 ? (
        <PortalEmptyState
          icon={<BellRing size={18} strokeWidth={1.5} />}
          title="No requests yet"
          description="When you make a request, you'll be able to follow its status here."
        />
      ) : (
        <div className="space-y-4">
          {requests.map((r) => {
            const meta = STATUS_META[r.status] ?? { label: r.status, variant: 'neutral' as const }
            return (
              <PortalCard key={r.id} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-[family-name:var(--font-display)] text-[17px] text-ivory leading-tight">
                      {r.request_type}
                    </p>
                    {(r.event_name || r.description) && (
                      <p className="mt-1.5 font-[family-name:var(--font-editorial)] italic text-[13.5px] text-ivory-soft/85 leading-[1.6]">
                        {r.event_name || r.description}
                      </p>
                    )}
                  </div>
                  <PortalBadge variant={meta.variant} dot>
                    {meta.label}
                  </PortalBadge>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.2em] text-slate-haze">
                  {r.location && <span>{r.location}</span>}
                  {r.dates && <span>{r.dates}</span>}
                  {r.guests != null && <span>{r.guests} guests</span>}
                  {r.quoted_amount_pence != null && (
                    <span className="text-bronze-light">Quote {formatCurrency(r.quoted_amount_pence)}</span>
                  )}
                  <span className="text-slate-dim">Requested {formatDate(r.created_at)}</span>
                </div>
              </PortalCard>
            )
          })}
        </div>
      )}
    </div>
  )
}
