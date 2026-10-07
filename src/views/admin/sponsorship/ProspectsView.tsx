'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Loader2,
  Search,
  Users,
  PenLine,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  ChevronDown,
  Mail,
  Building2,
  Plus,
  CheckCircle2,
} from 'lucide-react'
import { Button, Badge, Card, Modal, Select, Textarea, Input } from '@/components/ui'
import { toast } from '@/lib/hooks/use-toast'
import { apiClient } from '@/lib/http'
import { cn } from '@/lib/utils'

// Ranked sponsor prospects for one event. Warm CRM matches sit first (the API
// orders them), cold discovery follows and is visually distinct.

interface Prospect {
  id: string
  event_id: string
  company_name: string
  company_domain: string | null
  website_url: string | null
  linkedin_url: string | null
  industry: string | null
  employee_count: number | null
  revenue_printed: string | null
  description: string | null
  source: string | null
  temperature: 'warm' | 'cold'
  match_score: number | null
  match_reasons: string[] | null
  ai_rationale: string | null
  status: string
  converted_sponsorship_id: string | null
  created_at: string
}

interface DecisionMaker {
  id: string
  prospect_id: string
  first_name: string | null
  last_name: string | null
  title: string | null
  seniority: string | null
  email: string | null
  linkedin_url: string | null
  is_primary: boolean
}

const VOICE_OPTIONS = [
  { value: 'club', label: 'The Club' },
  { value: 'sarah', label: 'Sarah' },
]

function scoreVariant(score: number | null): 'active' | 'upcoming' | 'draft' {
  if (score == null) return 'draft'
  if (score >= 70) return 'active'
  if (score >= 40) return 'upcoming'
  return 'draft'
}

function dmName(dm: DecisionMaker): string {
  return `${dm.first_name ?? ''} ${dm.last_name ?? ''}`.trim() || 'Contact'
}

export function ProspectsView({ eventId: eventIdProp }: { eventId?: string }) {
  const searchParams = useSearchParams()
  const eventId = eventIdProp ?? searchParams.get('event_id') ?? ''

  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // decision-maker cache + per-prospect fetch state / message
  const [dmByProspect, setDmByProspect] = useState<Record<string, DecisionMaker[]>>({})
  const [dmBusy, setDmBusy] = useState<string | null>(null)
  const [dmMessage, setDmMessage] = useState<Record<string, string>>({})
  const [statusBusy, setStatusBusy] = useState<string | null>(null)
  const [convertBusy, setConvertBusy] = useState<string | null>(null)

  // draft-outreach modal
  const [draftFor, setDraftFor] = useState<Prospect | null>(null)

  const load = useCallback(async () => {
    if (!eventId) {
      setProspects([])
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/sponsorship/prospects?event_id=${eventId}`)
      const json = await res.json()
      if (res.ok) setProspects(json.prospects ?? [])
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    load()
  }, [load])

  async function changeStatus(p: Prospect, status: string) {
    setStatusBusy(p.id)
    const prev = prospects
    setProspects((list) => list.map((row) => (row.id === p.id ? { ...row, status } : row)))
    try {
      const res = await fetch('/api/admin/sponsorship/prospects', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, status }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Update failed')
      }
      toast({ title: status === 'shortlisted' ? 'Shortlisted' : 'Dismissed' })
    } catch (e) {
      setProspects(prev)
      toast({
        title: 'Could not update',
        description: e instanceof Error ? e.message : 'Update failed',
        variant: 'destructive',
      })
    } finally {
      setStatusBusy(null)
    }
  }

  async function addAsSponsor(p: Prospect) {
    setConvertBusy(p.id)
    try {
      const res = await fetch('/api/admin/sponsorship/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: p.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Could not add to event sponsors')
      setProspects((list) =>
        list.map((row) =>
          row.id === p.id
            ? { ...row, converted_sponsorship_id: json.sponsorship_id, status: 'won' }
            : row,
        ),
      )
      toast({
        title: json.already ? 'Already in the event sponsors' : 'Added to event sponsors',
        description: 'It now appears in the event’s Sponsors panel with the proposal / invite / ROI tools.',
      })
    } catch (e) {
      toast({
        title: 'Could not add sponsor',
        description: e instanceof Error ? e.message : 'Conversion failed',
        variant: 'destructive',
      })
    } finally {
      setConvertBusy(null)
    }
  }

  async function findDecisionMakers(p: Prospect) {
    setExpandedId(p.id)
    if (dmByProspect[p.id]) return // already loaded
    setDmBusy(p.id)
    setDmMessage((m) => ({ ...m, [p.id]: '' }))
    try {
      // The route reports degrades as HTTP 200 + `status`/`message`, so read
      // the body for every status code (validateStatus) — a non-2xx falls
      // through to the generic "unavailable" message, exactly as before.
      const { data: json } = await apiClient.post<{
        status?: string
        message?: string
        decision_makers?: DecisionMaker[]
      }>(
        '/api/admin/sponsorship/decision-makers',
        { prospect_id: p.id },
        { validateStatus: () => true },
      )
      if (json?.status === 'ok') {
        setDmByProspect((m) => ({ ...m, [p.id]: json.decision_makers ?? [] }))
        if ((json.decision_makers ?? []).length === 0) {
          setDmMessage((m) => ({ ...m, [p.id]: 'No decision-makers found for this company.' }))
        }
      } else {
        setDmMessage((m) => ({
          ...m,
          [p.id]:
            json?.message ??
            (json?.status === 'upgrade_required'
              ? 'People search needs a paid vendor plan.'
              : 'People search is unavailable right now.'),
        }))
      }
    } catch (e) {
      setDmMessage((m) => ({
        ...m,
        [p.id]: e instanceof Error ? e.message : 'People search failed.',
      }))
    } finally {
      setDmBusy(null)
    }
  }

  if (!eventId) {
    return (
      <Card className="p-8 text-center text-text-muted">
        Choose an event to see its ideal sponsors.
      </Card>
    )
  }

  return (
    <>
      {loading ? (
        <Card className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading prospects…
        </Card>
      ) : prospects.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center">
            <Search size={20} className="text-text-dim" />
          </div>
          <p className="text-text font-medium">No prospects yet</p>
          <p className="text-sm text-text-muted max-w-sm">
            Run a match from the intelligence panel to surface warm CRM matches and cold discovery
            for this event.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {prospects.map((p) => {
            const cold = p.temperature === 'cold'
            const expanded = expandedId === p.id
            const dms = dmByProspect[p.id] ?? []
            const converted = !!p.converted_sponsorship_id
            return (
              <Card key={p.id} className={cn('overflow-hidden', cold && 'bg-surface-2/30')}>
                <div className="p-4 md:p-5">
                  {/* Header — company + score/temperature/status */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-text text-base leading-tight">
                          {p.company_name}
                        </span>
                        {p.match_score != null && (
                          <Badge variant={scoreVariant(p.match_score)}>{p.match_score} fit</Badge>
                        )}
                        {cold ? (
                          <Badge variant="draft">Cold</Badge>
                        ) : (
                          <Badge variant="upcoming">
                            Warm{p.source ? ` · ${p.source.replace(/_/g, ' ')}` : ''}
                          </Badge>
                        )}
                        {p.status && p.status !== 'new' && p.status !== 'suggested' && (
                          <span className="text-[10px] uppercase tracking-wide text-text-dim">
                            {p.status}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs mt-1">
                        {(p.website_url || p.company_domain) && (
                          <a
                            href={p.website_url ?? `https://${p.company_domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-gold hover:underline truncate max-w-[220px]"
                          >
                            {p.company_domain ?? 'Website'}
                            <ExternalLink size={11} className="shrink-0" />
                          </a>
                        )}
                        {p.linkedin_url && (
                          <a
                            href={p.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-dim hover:text-gold"
                          >
                            LinkedIn
                          </a>
                        )}
                      </div>
                      {p.industry && (
                        <p className="text-sm text-text-muted mt-2 line-clamp-2 max-w-2xl">
                          {p.industry}
                        </p>
                      )}
                      {p.revenue_printed && (
                        <p className="text-xs text-text-dim mt-0.5">{p.revenue_printed}</p>
                      )}
                    </div>
                    {converted && (
                      <span className="inline-flex items-center gap-1.5 text-xs text-accent shrink-0">
                        <CheckCircle2 size={14} /> In event sponsors
                      </span>
                    )}
                  </div>

                  {/* Actions — all on one wrapping row */}
                  <div className="flex items-center gap-2 flex-wrap mt-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<ThumbsUp size={13} />}
                      loading={statusBusy === p.id}
                      onClick={() => changeStatus(p, 'shortlisted')}
                    >
                      Shortlist
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<ThumbsDown size={13} />}
                      onClick={() => changeStatus(p, 'dismissed')}
                      className="text-accent-warm hover:text-accent-warm"
                    >
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={
                        dmBusy === p.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Users size={13} />
                        )
                      }
                      onClick={() => findDecisionMakers(p)}
                    >
                      People
                    </Button>
                    <Button size="sm" icon={<PenLine size={13} />} onClick={() => setDraftFor(p)}>
                      Draft
                    </Button>
                    {!converted && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus size={14} />}
                        loading={convertBusy === p.id}
                        onClick={() => addAsSponsor(p)}
                      >
                        Add to event sponsors
                      </Button>
                    )}
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : p.id)}
                      className="inline-flex items-center gap-1 text-xs text-text-dim hover:text-text px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-surface-2 transition-colors"
                    >
                      {expanded ? 'Hide' : 'Details'}
                      <ChevronDown
                        size={14}
                        className={cn('transition-transform', expanded && 'rotate-180')}
                      />
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div className="border-t border-border bg-surface-2/40 p-4 md:p-5 space-y-4">
                    {/* Why this match */}
                    {((p.match_reasons?.length ?? 0) > 0 || p.ai_rationale) && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-text-dim">
                          Why this match
                        </p>
                        {(p.match_reasons?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {p.match_reasons!.map((r, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-full text-[11px] bg-surface-3 text-text-muted"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                        {p.ai_rationale && (
                          <p className="text-sm text-text-muted max-w-3xl">{p.ai_rationale}</p>
                        )}
                      </div>
                    )}
                    {p.description && (
                      <p className="text-sm text-text-muted max-w-3xl">{p.description}</p>
                    )}
                    {/* Decision-makers */}
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-text-dim mb-2 flex items-center gap-1.5">
                        <Building2 size={12} /> Decision-makers
                      </p>
                      {dmBusy === p.id ? (
                        <p className="text-sm text-text-dim flex items-center gap-2">
                          <Loader2 size={13} className="animate-spin" /> Searching…
                        </p>
                      ) : dmMessage[p.id] ? (
                        <p className="text-sm text-accent-warm">{dmMessage[p.id]}</p>
                      ) : dms.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          {dms.map((dm) => (
                            <div key={dm.id} className="flex flex-wrap items-center gap-2 text-sm">
                              <span className="font-medium text-text">{dmName(dm)}</span>
                              {dm.is_primary && <Badge variant="active">Primary</Badge>}
                              {dm.title && <span className="text-text-muted">· {dm.title}</span>}
                              {dm.email && (
                                <a
                                  href={`mailto:${dm.email}`}
                                  className="inline-flex items-center gap-1 text-gold hover:underline"
                                >
                                  <Mail size={12} /> {dm.email}
                                </a>
                              )}
                              {dm.linkedin_url && (
                                <a
                                  href={dm.linkedin_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-text-dim hover:text-gold text-xs"
                                >
                                  LinkedIn
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-text-dim">
                          Use “People” to find decision-makers at this company.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <DraftOutreachModal
        prospect={draftFor}
        decisionMakers={draftFor ? dmByProspect[draftFor.id] ?? [] : []}
        onClose={() => setDraftFor(null)}
      />
    </>
  )
}

function DraftOutreachModal({
  prospect,
  decisionMakers,
  onClose,
}: {
  prospect: Prospect | null
  decisionMakers: DecisionMaker[]
  onClose: () => void
}) {
  const [voice, setVoice] = useState('club')
  const [steps, setSteps] = useState('3')
  const [decisionMakerId, setDecisionMakerId] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (prospect) {
      setVoice('club')
      setSteps('3')
      setNote('')
      setError(null)
      const primary = decisionMakers.find((d) => d.is_primary) ?? decisionMakers[0]
      setDecisionMakerId(primary?.id ?? '')
    }
  }, [prospect, decisionMakers])

  async function handleDraft() {
    if (!prospect) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/sponsorship/outreach/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_id: prospect.id,
          decision_maker_id: decisionMakerId || undefined,
          voice,
          steps: Number(steps) || 3,
          note: note.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Could not draft outreach')
      const n = (json.drafts ?? []).length
      toast({
        title: `${n} draft${n === 1 ? '' : 's'} added to the review queue`,
        description: 'Review, approve and send from the review queue.',
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft outreach')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={!!prospect}
      onClose={onClose}
      title={prospect ? `Draft outreach — ${prospect.company_name}` : 'Draft outreach'}
      size="md"
    >
      {prospect && (
        <div className="space-y-5">
          <p className="text-sm text-text-muted">
            Generate a personalised outreach sequence. Nothing is sent — every step lands in the
            review queue for you to edit, approve and send.
          </p>

          <Select
            label="Voice"
            options={VOICE_OPTIONS}
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
          />

          {decisionMakers.length > 0 && (
            <Select
              label="Recipient"
              placeholder="Company (no named contact)"
              options={decisionMakers.map((d) => ({
                value: d.id,
                label: d.title ? `${dmName(d)} · ${d.title}` : dmName(d),
              }))}
              value={decisionMakerId}
              onChange={(e) => setDecisionMakerId(e.target.value)}
            />
          )}

          <Input
            label="Steps"
            type="number"
            min={1}
            max={6}
            hint="How many touches in the sequence."
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
          />

          <Textarea
            label="Note for the writer (optional)"
            placeholder="e.g. lead with the drinks-reception slot; keep it warm and brief."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />

          {error && <p className="text-sm text-accent-warm">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleDraft} loading={busy}>
              Add drafts to queue
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// Small link surfaced by the Hub after drafting.
export function QueueLink({ eventId }: { eventId: string }) {
  return (
    <Link
      href={`/dashboard/sponsorship/outreach?event_id=${eventId}`}
      className="text-sm text-gold hover:underline"
    >
      Go to review queue →
    </Link>
  )
}
