'use client'

// One phone call: AI summary, what the receptionist captured, the call-back
// request / escalation, links into the CRM and the full transcript as chat
// bubbles (caller left, receptionist right, tool events as markers).

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ExternalLink, PhoneCall, RotateCcw, Sparkles } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Bubble, BubbleContent, Marker, MarkerContent, MarkerIcon, Message } from '@/components/ui/chat'
import {
  callerLabel,
  displayPhone,
  fetchCallDetail,
  formatDuration,
  formatWhen,
  INTEREST_LABELS,
  OUTCOME_META,
  personName,
  TEAM_LABELS,
  type CallDetail,
} from './calls-data'

export function CallDetailModal({
  callId,
  onClose,
  onToggleHandled,
  toggling,
}: {
  callId: string | null
  onClose: () => void
  onToggleHandled: (call: CallDetail) => void
  toggling: boolean
}) {
  const { data: call, isLoading, error } = useQuery({
    queryKey: ['voice-calls', 'detail', callId],
    queryFn: () => fetchCallDetail(callId as string),
    enabled: !!callId,
  })

  return (
    <Modal open={!!callId} onClose={onClose} size="xl" title={call ? callerLabel(call) : 'Call'}>
      {isLoading || !callId ? (
        <div className="flex items-center gap-3 py-8">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading call…</span>
        </div>
      ) : error ? (
        <p className="py-6 text-sm text-accent-warm">{(error as Error).message}</p>
      ) : !call ? (
        <p className="py-6 text-sm text-text-muted">This call could not be found.</p>
      ) : (
        <CallBody call={call} onToggleHandled={onToggleHandled} toggling={toggling} />
      )}
    </Modal>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-dim">{label}</dt>
      <dd className="mt-0.5 text-sm text-text break-words">{value || '—'}</dd>
    </div>
  )
}

function CallBody({
  call,
  onToggleHandled,
  toggling,
}: {
  call: CallDetail
  onToggleHandled: (call: CallDetail) => void
  toggling: boolean
}) {
  const outcome = call.outcome ? OUTCOME_META[call.outcome] : null
  const memberName = personName(call.member?.profile)
  const contactName = personName(call.contact)

  return (
    <div className="space-y-5">
      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
        {outcome && <Badge variant={outcome.variant}>{outcome.label}</Badge>}
        {call.escalated && call.outcome !== 'escalated' && <Badge variant="urgent">Escalated</Badge>}
        {call.handled_at ? (
          <Badge variant="active" dot>
            Handled
          </Badge>
        ) : null}
        <span>{formatWhen(call.started_at)}</span>
        <span aria-hidden>·</span>
        <span>{formatDuration(call.duration_s)}</span>
        <span aria-hidden>·</span>
        <span>{displayPhone(call.from_number)}</span>
        <div className="ml-auto">
          <Button
            size="sm"
            variant={call.handled_at ? 'ghost' : 'primary'}
            loading={toggling}
            icon={call.handled_at ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
            onClick={() => onToggleHandled(call)}
          >
            {call.handled_at ? 'Mark unhandled' : 'Mark handled'}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <section className="rounded-[var(--radius-lg)] border border-border-gold bg-gold-muted/40 px-4 py-3">
        <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-gold">
          <Sparkles size={12} /> AI summary
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-text">{call.summary || 'No summary yet.'}</p>
      </section>

      {/* Escalation + callback */}
      {(call.escalated || call.callback_requested_at) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {call.escalated && (
            <section className="rounded-[var(--radius-lg)] border border-accent-warm/35 bg-accent-warm/5 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-accent-warm">
                <AlertTriangle size={12} /> Escalated
              </p>
              <p className="mt-1.5 text-sm text-text">{call.escalation_reason || 'Needs a team member.'}</p>
            </section>
          )}
          {call.callback_requested_at && (
            <section className="rounded-[var(--radius-lg)] border border-border bg-surface-2 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-gold">
                <PhoneCall size={12} /> Call back requested
              </p>
              <p className="mt-1.5 text-sm text-text">
                {TEAM_LABELS[call.callback_team ?? ''] ?? 'The team'} — preferred{' '}
                {call.callback_preferred_text || 'time not specified'}
                {call.callback_preferred_at ? ` (≈ ${formatWhen(call.callback_preferred_at)})` : ''}
              </p>
              {call.callback_note && <p className="mt-1 text-xs text-text-muted">{call.callback_note}</p>}
              <p className="mt-1 text-xs text-text-dim">Not booked — confirm a time with the caller.</p>
            </section>
          )}
        </div>
      )}

      {/* Captured details */}
      <section>
        <h3 className="mb-2 font-[family-name:var(--font-heading)] text-base font-semibold text-text">Captured details</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Name" value={call.caller_name} />
          <Field label="Callback number" value={call.caller_phone ? displayPhone(call.caller_phone) : null} />
          <Field label="Email" value={call.caller_email} />
          <Field label="Company" value={call.caller_company} />
          <Field label="Role" value={call.caller_role} />
          <Field label="Interested in" value={call.interest ? INTEREST_LABELS[call.interest] ?? call.interest : null} />
          <Field label="Approx. turnover" value={call.turnover_band} />
          <div className="sm:col-span-2">
            <Field label="Message" value={call.notes} />
          </div>
        </dl>
      </section>

      {/* CRM links */}
      {(call.enquiry_id || call.member_id || call.contact_id) && (
        <div className="flex flex-wrap gap-2">
          {call.enquiry_id && (
            <Link href="/dashboard/enquiries" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-muted hover:border-border-hover hover:text-text">
              <ExternalLink size={12} /> Enquiry (phone receptionist)
            </Link>
          )}
          {call.member_id && (
            <Link href={`/dashboard/members/${call.member_id}`} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-muted hover:border-border-hover hover:text-text">
              <ExternalLink size={12} /> Member{memberName ? `: ${memberName}` : ''}
            </Link>
          )}
          {call.contact_id && (
            <Link href="/dashboard/contacts" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-muted hover:border-border-hover hover:text-text">
              <ExternalLink size={12} /> Contact{contactName ? `: ${contactName}` : ''}
            </Link>
          )}
        </div>
      )}

      {/* Transcript */}
      <section>
        <h3 className="mb-2 font-[family-name:var(--font-heading)] text-base font-semibold text-text">Transcript</h3>
        {call.transcript?.length ? (
          <div className="chat-theme space-y-2 rounded-[var(--radius-lg)] border border-border bg-surface-2/40 p-3 sm:p-4">
            {call.transcript.map((t, i) =>
              t.role === 'event' ? (
                <Marker key={i}>
                  <MarkerIcon>
                    <Sparkles />
                  </MarkerIcon>
                  <MarkerContent>{t.text}</MarkerContent>
                </Marker>
              ) : (
                <Message key={i} align={t.role === 'caller' ? 'start' : 'end'}>
                  <div className={t.role === 'caller' ? 'max-w-[85%]' : 'max-w-[85%] flex flex-col items-end'}>
                    <p className="mb-0.5 px-1 text-[10px] uppercase tracking-[0.12em] text-text-dim">
                      {t.role === 'caller' ? 'Caller' : 'Receptionist'} ·{' '}
                      {new Date(t.at).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      {t.interrupted ? ' · interrupted' : ''}
                    </p>
                    <Bubble variant={t.role === 'caller' ? 'secondary' : 'tinted'}>
                      <BubbleContent>{t.text}</BubbleContent>
                    </Bubble>
                  </div>
                </Message>
              ),
            )}
          </div>
        ) : (
          <p className="text-sm text-text-muted">No transcript — the caller hung up before speaking.</p>
        )}
        {call.model && (
          <p className="mt-2 text-[11px] text-text-dim">
            {call.model} · {call.prompt_tokens + call.completion_tokens} tokens · {call.call_sid}
            {call.error ? ` · last error: ${call.error}` : ''}
          </p>
        )}
      </section>
    </div>
  )
}
