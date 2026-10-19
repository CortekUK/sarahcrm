'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Loader2,
  Send,
  Save,
  Check,
  Undo2,
  Inbox,
  Mail,
  CalendarClock,
  Ban,
  RotateCcw,
  CircleStop,
} from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import {
  Button,
  Badge,
  Card,
  Modal,
  Select,
  Input,
  Textarea,
} from '@/components/ui'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'
import { apiClient, getApiErrorMessage } from '@/lib/http'
import { cn } from '@/lib/utils'

interface Outreach {
  id: string
  prospect_id: string
  decision_maker_id: string | null
  event_id: string
  step: number
  sender: string | null
  voice: string | null
  subject: string | null
  body_html: string | null
  body_text: string | null
  status: string
  to_email: string | null
  sent_at: string | null
  external_id: string | null
  created_at: string
  // Sequence fields (absent until the sequences migration is applied).
  sequence_id?: string | null
  delay_days?: number | null
  due_at?: string | null
  auto_send?: boolean | null
  opened_at?: string | null
  response_at?: string | null
  response_snippet?: string | null
  company_name?: string | null
  decision_maker_name?: string | null
  prospect_replied_at?: string | null
}

interface EventOption {
  id: string
  title: string
  start_date: string | null
}

const STATUS_VARIANT: Record<string, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  draft: 'draft',
  approved: 'active',
  scheduled: 'active',
  sent: 'info',
  failed: 'urgent',
  bounced: 'urgent',
  replied: 'upcoming',
  cancelled: 'draft',
}

const STATUS_ORDER = [
  'draft',
  'approved',
  'scheduled',
  'sent',
  'replied',
  'bounced',
  'failed',
  'cancelled',
]

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved (send by hand)' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'sent', label: 'Sent' },
  { value: 'replied', label: 'Replied' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

function statusVariant(status: string) {
  return STATUS_VARIANT[status] ?? 'draft'
}

// "Scheduled" is not its own DB status: it is an approved step that the admin
// chose to "approve and schedule" (auto_send), which the daily runner sends
// once due. Every other status is shown as stored.
function displayStatus(o: Outreach): string {
  return o.status === 'approved' && o.auto_send ? 'scheduled' : o.status
}

function fmtDay(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// One-line schedule summary for a step: when it went / goes out.
function scheduleLabel(o: Outreach): string | null {
  if (o.status === 'sent' || o.status === 'replied' || o.status === 'bounced') {
    return o.sent_at ? `Sent ${fmtDay(o.sent_at)}` : null
  }
  if (o.status === 'cancelled' || o.status === 'failed') return null
  // A due date only means something for a scheduled step or once the previous
  // step has gone out (the server only sets it then — computeDueAt /
  // scheduleNextStep); a first touch that isn't scheduled never shows one.
  if (o.due_at && (o.auto_send || o.step > 0)) {
    const overdue = new Date(o.due_at).getTime() <= Date.now()
    return overdue ? `Due now (${fmtDay(o.due_at)})` : `Due ${fmtDay(o.due_at)}`
  }
  if (o.step > 0 && o.delay_days != null) {
    return `${o.delay_days} day${o.delay_days === 1 ? '' : 's'} after previous step`
  }
  return null
}

export function OutreachQueueView() {
  const searchParams = useSearchParams()

  const [events, setEvents] = useState<EventOption[]>([])
  const [eventId, setEventId] = useState(searchParams.get('event_id') ?? '')
  const [statusFilter, setStatusFilter] = useState('')
  const [voiceFilter, setVoiceFilter] = useState('')

  const [items, setItems] = useState<Outreach[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Outreach | null>(null)

  useEffect(() => {
    supabase
      .from('events')
      .select('id, title, start_date')
      .order('start_date', { ascending: false })
      .limit(100)
      .then(({ data }) => setEvents((data ?? []) as EventOption[]))
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (eventId) params.set('event_id', eventId)
      // 'scheduled' is approved + auto_send — fetch approved, narrow below.
      if (statusFilter) params.set('status', statusFilter === 'scheduled' ? 'approved' : statusFilter)
      const qs = params.toString()
      const res = await fetch(`/api/admin/sponsorship/outreach${qs ? `?${qs}` : ''}`)
      const json = await res.json()
      if (res.ok) setItems(json.outreach ?? [])
    } finally {
      setLoading(false)
    }
  }, [eventId, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  function updateLocal(updated: Outreach) {
    setItems((prev) => prev.map((o) => (o.id === updated.id ? updated : o)))
    setEditing((cur) => (cur && cur.id === updated.id ? updated : cur))
  }

  // Voice + approved/scheduled split are applied client-side (cheap; no extra
  // round-trip).
  const visible = items.filter((o) => {
    if (voiceFilter && (o.voice ?? 'club') !== voiceFilter) return false
    if (statusFilter && displayStatus(o) !== statusFilter) return false
    return true
  })

  // Group by (display) status for readable sections.
  const grouped = STATUS_ORDER.map((status) => ({
    status,
    rows: visible.filter((o) => displayStatus(o) === status),
  })).filter((g) => g.rows.length > 0)
  const otherRows = visible.filter((o) => !STATUS_ORDER.includes(displayStatus(o)))

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Outreach review queue"
        description="Every drafted step waits here. Edit the copy and approve it, then send it now or approve and schedule follow-ups to go out on their due date. Nothing leaves without your approval, and a prospect's reply stops their sequence."
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6 max-w-xl">
        <div className="flex-1 min-w-[220px]">
          <Select
            label="Event"
            placeholder="All events"
            options={[
              { value: '', label: 'All events' },
              ...events.map((ev) => ({ value: ev.id, label: ev.title })),
            ]}
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          />
        </div>
        <div className="w-[180px]">
          <Select
            label="Status"
            options={STATUS_FILTER_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
        <div className="w-[180px]">
          <Select
            label="Voice"
            options={[
              { value: '', label: 'All voices' },
              { value: 'club', label: 'The Club' },
              { value: 'sarah', label: 'Sarah' },
            ]}
            value={voiceFilter}
            onChange={(e) => setVoiceFilter(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-text-muted text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading queue…
        </div>
      ) : visible.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center">
            <Inbox size={20} className="text-text-dim" />
          </div>
          <p className="text-text font-medium">Nothing in the queue</p>
          <p className="text-sm text-text-muted max-w-sm">
            {items.length > 0
              ? 'No drafts match the current filters.'
              : 'Draft outreach from a ranked prospect and the sequence will appear here for review.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          {[...grouped, ...(otherRows.length ? [{ status: 'other', rows: otherRows }] : [])].map(
            ({ status, rows }) => (
              <div key={status}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge variant={statusVariant(status)}>{status}</Badge>
                  <span className="text-xs text-text-dim">{rows.length}</span>
                </div>
                <div className="space-y-3">
                  {rows.map((o) => (
                    <OutreachRow key={o.id} item={o} onOpen={() => setEditing(o)} />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <OutreachEditor
        item={editing}
        onClose={() => setEditing(null)}
        onChange={updateLocal}
        onSelect={(o) => setEditing(o)}
        onSent={() => {
          setEditing(null)
          load()
        }}
        onReload={load}
      />
    </div>
  )
}

const VOICE_LABEL: Record<string, string> = { club: 'The Club', sarah: 'Sarah' }

function OutreachRow({ item, onOpen }: { item: Outreach; onOpen: () => void }) {
  const voice = item.voice ?? 'club'
  const status = displayStatus(item)
  const schedule = scheduleLabel(item)
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-surface-2 transition-colors"
      >
        <div className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
          <Mail size={16} className="text-gold" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-medium text-text truncate">
              {item.company_name ?? <span className="italic text-text-dim">Unknown company</span>}
            </p>
            {/* Voice badge — tell Club vs Sarah apart without opening the row. */}
            <Badge variant={voice === 'sarah' ? 'upcoming' : 'info'}>
              {VOICE_LABEL[voice] ?? voice}
            </Badge>
            {item.prospect_replied_at && <Badge variant="upcoming">Replied</Badge>}
          </div>
          <p className="text-xs text-text-dim truncate mt-0.5">
            {item.subject || 'No subject'}
            {item.decision_maker_name ? ` · ${item.decision_maker_name}` : ''}
            {item.to_email ? ` · ${item.to_email}` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end shrink-0 gap-0.5">
          <span className="text-[11px] text-text-dim">Step {item.step}</span>
          {schedule && <span className="text-[11px] text-text-dim">{schedule}</span>}
        </div>
        {item.opened_at && <Badge variant="info">Opened</Badge>}
        <Badge variant={statusVariant(status)}>{status}</Badge>
      </button>
    </Card>
  )
}

function OutreachEditor({
  item,
  onClose,
  onChange,
  onSelect,
  onSent,
  onReload,
}: {
  item: Outreach | null
  onClose: () => void
  onChange: (o: Outreach) => void
  onSelect: (o: Outreach) => void
  onSent: () => void
  onReload: () => void
}) {
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [toEmail, setToEmail] = useState('')
  const [delayDays, setDelayDays] = useState('')
  const [busy, setBusy] = useState<
    | null
    | 'save'
    | 'approve'
    | 'schedule'
    | 'unschedule'
    | 'unapprove'
    | 'cancel'
    | 'reopen'
    | 'stop'
    | 'send'
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [sequence, setSequence] = useState<Outreach[]>([])

  useEffect(() => {
    if (item) {
      setSubject(item.subject ?? '')
      setBodyText(item.body_text ?? '')
      setToEmail(item.to_email ?? '')
      setDelayDays(item.delay_days != null ? String(item.delay_days) : '')
      setError(null)
    }
  }, [item])

  // The whole sequence this step belongs to, for the timeline.
  const sequenceId = item?.sequence_id ?? null
  const loadSequence = useCallback(async () => {
    if (!sequenceId) {
      setSequence([])
      return
    }
    try {
      const { data } = await apiClient.get<{ outreach?: Outreach[] }>(
        '/api/admin/sponsorship/outreach',
        { params: { sequence_id: sequenceId } },
      )
      setSequence(data.outreach ?? [])
    } catch {
      setSequence([]) // timeline is a convenience — the editor still works
    }
  }, [sequenceId])

  useEffect(() => {
    loadSequence()
  }, [loadSequence])

  if (!item) return null

  const isDraft = item.status === 'draft'
  const isApproved = item.status === 'approved'
  const isPending = isDraft || isApproved
  const isScheduled = isApproved && !!item.auto_send
  const canSend = isApproved && !!toEmail.trim()
  const hasSequenceFields = item.delay_days !== undefined
  const status = displayStatus(item)
  const schedule = scheduleLabel(item)

  // Content edits ride along with approve/schedule so what's approved is what
  // was on screen.
  const content = () => ({
    subject,
    body_text: bodyText,
    to_email: toEmail || null,
    ...(hasSequenceFields && isPending && delayDays.trim() !== ''
      ? { delay_days: Number(delayDays) }
      : {}),
  })

  async function patch(
    action: 'save' | 'approve' | 'schedule' | 'unschedule' | 'unapprove' | 'cancel' | 'reopen' | 'stop',
    payload: Record<string, unknown>,
  ) {
    if (!item) return
    setBusy(action)
    setError(null)
    try {
      const res = await fetch('/api/admin/sponsorship/outreach', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, ...payload }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Update failed')
      const returnedStatus = (json.outreach as Outreach | null)?.status
      // Keep the queue-only fields the PATCH response doesn't carry.
      onChange({
        ...(json.outreach as Outreach),
        company_name: item.company_name,
        decision_maker_name: item.decision_maker_name,
        prospect_replied_at: item.prospect_replied_at,
      })
      if (item.status === 'approved' && returnedStatus === 'draft' && action !== 'unapprove') {
        // The server returns an edited approved email to draft.
        toast({
          title: 'Saved — returned to draft',
          description: 'You edited an approved email, so it needs approving again.',
        })
      } else {
        if (action === 'approve') toast({ title: 'Approved — ready to send' })
        if (action === 'schedule')
          toast({
            title: 'Approved and scheduled',
            description: 'It will be sent automatically on its due date unless the prospect replies.',
          })
        if (action === 'unschedule') toast({ title: 'Unscheduled — send it by hand when ready' })
        if (action === 'save') toast({ title: 'Saved' })
      }
      if (action === 'cancel') toast({ title: 'Step cancelled' })
      if (action === 'stop') {
        toast({ title: 'Sequence stopped', description: 'Every unsent step was cancelled.' })
        onReload()
      }
      loadSequence()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(null)
    }
  }

  async function send() {
    if (!item) return
    setBusy('send')
    setError(null)
    try {
      const res = await fetch('/api/admin/sponsorship/outreach/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outreach_id: item.id }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error ?? 'Send failed')
      toast({ title: 'Sent', description: toEmail ? `Delivered to ${toEmail}.` : undefined })
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={!!item} onClose={onClose} title="Review outreach" size="xl">
      <div className="space-y-5">
        <div className="flex items-center gap-2 flex-wrap text-sm text-text-muted">
          <Badge variant={statusVariant(status)}>{status}</Badge>
          {item.prospect_replied_at && <Badge variant="upcoming">Replied</Badge>}
          {item.opened_at && <Badge variant="info">Opened</Badge>}
          <span>{item.company_name ?? 'Company'}</span>
          {item.decision_maker_name && <span>· {item.decision_maker_name}</span>}
          <span>· Step {item.step}</span>
          {item.voice && <span>· {item.voice} voice</span>}
          {schedule && <span>· {schedule}</span>}
        </div>

        {item.prospect_replied_at && (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3 text-sm text-text-muted">
            This prospect replied on {fmtDay(item.prospect_replied_at)}, so their remaining steps
            were stopped and nothing more is sent automatically.
            {item.response_snippet && (
              <span className="block mt-1 italic text-text">“{item.response_snippet}”</span>
            )}
          </div>
        )}

        {sequence.length > 1 && (
          <SequenceTimeline steps={sequence} currentId={item.id} onSelect={onSelect} />
        )}

        <Input
          label="To"
          type="email"
          placeholder="name@company.com"
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
        />

        <Input
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />

        <Textarea
          label="Body"
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          className="min-h-[220px]"
        />

        {hasSequenceFields && isPending && item.step > 0 && (
          <div className="max-w-[260px]">
            <Input
              label="Send after (days)"
              type="number"
              min={0}
              max={365}
              hint="Days after the previous step is sent."
              value={delayDays}
              onChange={(e) => setDelayDays(e.target.value)}
            />
          </div>
        )}

        {item.body_html && (
          <div>
            <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
              Preview
            </p>
            <div
              className="rounded-[var(--radius-md)] border border-border bg-surface p-4 text-sm text-text max-h-64 overflow-y-auto prose-sm"
              // Preview of the generated HTML email body.
              dangerouslySetInnerHTML={{ __html: item.body_html }}
            />
          </div>
        )}

        {isApproved && (
          <p className="text-xs text-text-dim">
            Editing an approved email returns it to draft for re-approval.
          </p>
        )}

        {error && <p className="text-sm text-accent-warm">{error}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-border -mx-6 px-6 pt-4">
          <Button
            size="sm"
            variant="secondary"
            icon={<Save size={14} />}
            loading={busy === 'save'}
            onClick={() => patch('save', content())}
          >
            Save
          </Button>

          {isDraft && (
            <>
              <Button
                size="sm"
                icon={<Check size={14} />}
                loading={busy === 'approve'}
                onClick={() => patch('approve', { status: 'approved', ...content() })}
              >
                Approve
              </Button>
              {hasSequenceFields && (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<CalendarClock size={14} />}
                  loading={busy === 'schedule'}
                  onClick={() =>
                    patch('schedule', { status: 'approved', auto_send: true, ...content() })
                  }
                >
                  Approve &amp; schedule
                </Button>
              )}
            </>
          )}

          {isApproved && hasSequenceFields && (
            <Button
              size="sm"
              variant="secondary"
              icon={<CalendarClock size={14} />}
              loading={busy === 'schedule' || busy === 'unschedule'}
              onClick={() =>
                isScheduled
                  ? patch('unschedule', { auto_send: false })
                  : patch('schedule', { auto_send: true, ...content() })
              }
            >
              {isScheduled ? 'Unschedule' : 'Schedule'}
            </Button>
          )}

          {isApproved && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Undo2 size={14} />}
              loading={busy === 'unapprove'}
              onClick={() => patch('unapprove', { status: 'draft' })}
            >
              Unapprove
            </Button>
          )}

          {isPending && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Ban size={14} />}
              loading={busy === 'cancel'}
              onClick={() => patch('cancel', { status: 'cancelled' })}
            >
              Cancel step
            </Button>
          )}

          {(item.status === 'cancelled' || item.status === 'failed') && (
            <Button
              size="sm"
              variant="ghost"
              icon={<RotateCcw size={14} />}
              loading={busy === 'reopen'}
              onClick={() => patch('reopen', { status: 'draft' })}
            >
              Back to draft
            </Button>
          )}

          {sequence.length > 1 && sequence.some((s) => s.status === 'draft' || s.status === 'approved') && (
            <Button
              size="sm"
              variant="ghost"
              icon={<CircleStop size={14} />}
              loading={busy === 'stop'}
              onClick={() => patch('stop', { stop_sequence: true })}
            >
              Stop sequence
            </Button>
          )}

          <div className="flex-1" />

          {/* Human gate — Send only lights up once approved with a recipient. */}
          <span
            title={
              canSend
                ? undefined
                : !isApproved
                  ? 'Approve first'
                  : 'Add a recipient email first'
            }
          >
            <Button
              size="sm"
              icon={<Send size={14} />}
              loading={busy === 'send'}
              disabled={!canSend}
              onClick={send}
              className={cn(!canSend && 'opacity-50')}
            >
              {isScheduled ? 'Send now' : 'Send'}
            </Button>
          </span>
        </div>
      </div>
    </Modal>
  )
}

// Every step of one sequence, in order, with its schedule + status. Clicking a
// step opens it in the editor.
function SequenceTimeline({
  steps,
  currentId,
  onSelect,
}: {
  steps: Outreach[]
  currentId: string
  onSelect: (o: Outreach) => void
}) {
  return (
    <div>
      <p className="font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
        Sequence
      </p>
      <div className="rounded-[var(--radius-md)] border border-border divide-y divide-border">
        {steps.map((s) => {
          const st = displayStatus(s)
          const when = scheduleLabel(s)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s)}
              className={cn(
                'w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm transition-colors',
                s.id === currentId ? 'bg-surface-2' : 'hover:bg-surface-2',
              )}
            >
              <span className="text-[11px] text-text-dim w-12 shrink-0">Step {s.step}</span>
              <span className="flex-1 min-w-0 truncate text-text">{s.subject || 'No subject'}</span>
              {when ? (
                <span className="text-[11px] text-text-dim shrink-0">{when}</span>
              ) : (
                s.status !== 'cancelled' &&
                s.status !== 'failed' &&
                s.step > 0 && (
                  <span className="text-[11px] text-text-dim shrink-0">Waits for previous step</span>
                )
              )}
              {s.opened_at && <Badge variant="info">Opened</Badge>}
              <Badge variant={statusVariant(st)}>{st}</Badge>
            </button>
          )
        })}
      </div>
    </div>
  )
}
