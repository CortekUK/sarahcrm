'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuth } from '@/providers/AuthProvider'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
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
import type { FormValues } from '@/components/website/forms/SiteForm'
import {
  MEMBER_REQUEST_TYPES,
  REQUEST_FIELDS,
  memberStatusLabel,
  type MemberRequestType,
} from '@/components/website/night/concierge/requestTypes'
import { insertConciergeRequest } from '@/components/website/night/concierge/ConciergeForms'

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

// Brief: members see New / In progress / Quoted / Confirmed / Completed
// (+ Closed for declined / cancelled) — never the internal pipeline.
const LABEL_VARIANT: Record<string, PortalBadgeVariant> = {
  New: 'neutral',
  'In progress': 'info',
  Quoted: 'upcoming',
  Confirmed: 'active',
  Completed: 'active',
  Closed: 'draft',
}

const TYPE_BLURB: Record<MemberRequestType, string> = {
  'Access Request': 'Hard-to-get tables, sporting and cultural events, private viewings, members’ clubs, introductions.',
  'Travel Services':
    'Private aviation (JET365) and travel with Rhythm & Routes: villas, yachts, hotels, chauffeur and bespoke itineraries.',
  'Retail & Hospitality Bookings':
    'Personal shopping and private appointments, sourced goods, restaurant and hotel bookings at member rates.',
}

function emptyValues(): FormValues {
  return {}
}

export function PortalConciergePage() {
  const { user } = useAuth()
  const [memberId, setMemberId] = useState<string | null>(null)
  const [requests, setRequests] = useState<SafeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState<MemberRequestType>('Access Request')
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user?.id) init(user.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  async function init(userId: string) {
    setLoading(true)
    const { data: me } = await supabase.from('members').select('id').eq('profile_id', userId).maybeSingle()
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

  function chooseType(t: MemberRequestType) {
    setType(t)
    setValues(emptyValues())
    setFieldErrors({})
    setError(null)
  }

  const val = (name: string) => (typeof values[name] === 'string' ? (values[name] as string) : '')
  function set(name: string, v: string) {
    setValues((p) => ({ ...p, [name]: v }))
    if (fieldErrors[name]) setFieldErrors((p) => ({ ...p, [name]: '' }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!memberId || submitting) return
    const errs: Record<string, string> = {}
    for (const f of REQUEST_FIELDS[type]) {
      if (f.type === 'heading' || f.type === 'note') continue
      if (f.required && !val(f.name).trim()) errs[f.name] = 'Required'
      if (f.type === 'number' && val(f.name).trim() && !/^\d+$/.test(val(f.name).trim())) {
        errs[f.name] = 'A whole number, please'
      }
    }
    if (Object.values(errs).some(Boolean)) {
      setFieldErrors(errs)
      return
    }
    setSubmitting(true)
    setSubmitted(false)
    setError(null)
    const result = await insertConciergeRequest(memberId, type, values)
    setSubmitting(false)
    if (!result.ok) {
      setError(result.error ?? 'We could not submit your request. Please try again.')
      return
    }
    setSubmitted(true)
    setValues(emptyValues())
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
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-10 py-12 lg:py-16">
      <PortalPageHeader
        eyebrow="Private Concierge"
        title="Ask for anything; we deliver it."
        subtitle="Access, travel and bookings, handled end to end by the concierge team."
      />

      {/* Request form */}
      <PortalCard className="p-6 lg:p-8 mb-10">
        <PortalSectionTitle eyebrow="New request">Make a request.</PortalSectionTitle>

        <div role="tablist" aria-label="Request type" className="flex flex-wrap gap-2 mb-3">
          {MEMBER_REQUEST_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={type === t}
              onClick={() => chooseType(t)}
              className={cn(
                'px-4 py-2 rounded-full border font-[family-name:var(--font-meta)] text-[10px] uppercase tracking-[0.2em] transition-colors',
                type === t
                  ? 'border-bronze bg-bronze/15 text-bronze-light'
                  : 'border-graphite-line/70 text-ivory-soft hover:border-bronze/50 hover:text-ivory',
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="mb-7 font-[family-name:var(--font-editorial)] italic text-[14px] text-ivory-soft/85">
          {TYPE_BLURB[type]}
        </p>

        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            {REQUEST_FIELDS[type].map((f) => {
              if (f.type === 'heading' || f.type === 'note') return null
              const span = 'half' in f && f.half ? '' : 'md:col-span-2'
              const id = `concierge-${f.name}`
              let control: React.ReactNode = null
              if (f.type === 'select') {
                control = (
                  <PortalSelect
                    id={id}
                    value={val(f.name)}
                    onChange={(v) => set(f.name, v)}
                    options={f.options}
                    placeholder="Choose…"
                  />
                )
              } else if (f.type === 'textarea') {
                control = (
                  <PortalTextarea
                    id={id}
                    rows={f.rows ?? 3}
                    placeholder={f.placeholder}
                    value={val(f.name)}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                )
              } else if (f.type === 'text' || f.type === 'number' || f.type === 'date' || f.type === 'email' || f.type === 'url') {
                control = (
                  <PortalInput
                    id={id}
                    type={f.type === 'number' ? 'text' : f.type}
                    inputMode={f.type === 'number' ? 'numeric' : undefined}
                    placeholder={f.placeholder}
                    value={val(f.name)}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                )
              }
              if (!control) return null
              return (
                <div key={`${type}-${f.name}`} className={span}>
                  <PortalField
                    label={f.required ? f.label : `${f.label} (optional)`}
                    htmlFor={id}
                    error={fieldErrors[f.name]}
                  >
                    {control}
                  </PortalField>
                </div>
              )
            })}
          </div>

          {error && (
            <p role="alert" className="text-[12.5px] text-accent-warm italic">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-5 pt-1">
            {submitted && (
              <span
                role="status"
                className="inline-flex items-center gap-2 font-[family-name:var(--font-meta)] text-[10.5px] uppercase tracking-[0.28em] text-accent"
              >
                <Check size={13} strokeWidth={2} />
                Request sent
              </span>
            )}
            <PortalButton
              type="submit"
              icon={<Send size={13} strokeWidth={1.5} />}
              loading={submitting}
              disabled={submitting || !memberId}
            >
              Send request
            </PortalButton>
          </div>
        </form>
      </PortalCard>

      {/* Member's own requests */}
      <PortalSectionTitle eyebrow="My requests">Where things stand.</PortalSectionTitle>
      {requests.length === 0 ? (
        <PortalEmptyState
          icon={<BellRing size={18} strokeWidth={1.5} />}
          title="No requests yet"
          description="When you make a request, you'll be able to follow its status here."
        />
      ) : (
        <div className="space-y-4">
          {requests.map((r) => {
            const label = memberStatusLabel(r.status)
            const summary = r.event_name || (r.description ?? '').split('\n')[0]
            return (
              <PortalCard key={r.id} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-[family-name:var(--font-display)] text-[17px] text-ivory leading-tight">
                      {r.request_type}
                    </p>
                    {summary && (
                      <p className="mt-1.5 font-[family-name:var(--font-editorial)] italic text-[13.5px] text-ivory-soft/85 leading-[1.6] line-clamp-2">
                        {summary}
                      </p>
                    )}
                  </div>
                  <PortalBadge variant={LABEL_VARIANT[label] ?? 'neutral'} dot>
                    {label}
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
