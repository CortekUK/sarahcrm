'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2, Send, Save, Check, Undo2, Inbox, Mail } from 'lucide-react'
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
  company_name?: string | null
  decision_maker_name?: string | null
}

interface EventOption {
  id: string
  title: string
  start_date: string | null
}

const STATUS_VARIANT: Record<string, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  draft: 'draft',
  approved: 'active',
  sent: 'info',
  failed: 'urgent',
  replied: 'upcoming',
}

const STATUS_ORDER = ['draft', 'approved', 'sent', 'replied', 'failed']

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'sent', label: 'Sent' },
  { value: 'replied', label: 'Replied' },
  { value: 'failed', label: 'Failed' },
]

function statusVariant(status: string) {
  return STATUS_VARIANT[status] ?? 'draft'
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
      if (statusFilter) params.set('status', statusFilter)
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

  // Voice filter is applied client-side (cheap; no extra round-trip).
  const visible = voiceFilter ? items.filter((o) => (o.voice ?? 'club') === voiceFilter) : items

  // Group by status for readable sections.
  const grouped = STATUS_ORDER.map((status) => ({
    status,
    rows: visible.filter((o) => o.status === status),
  })).filter((g) => g.rows.length > 0)
  const otherRows = visible.filter((o) => !STATUS_ORDER.includes(o.status))

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Outreach review queue"
        description="Every drafted step waits here. Edit the copy, approve it, then send — nothing leaves until you approve and click Send."
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
        onSent={() => {
          setEditing(null)
          load()
        }}
      />
    </div>
  )
}

const VOICE_LABEL: Record<string, string> = { club: 'The Club', sarah: 'Sarah' }

function OutreachRow({ item, onOpen }: { item: Outreach; onOpen: () => void }) {
  const voice = item.voice ?? 'club'
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
          </div>
          <p className="text-xs text-text-dim truncate mt-0.5">
            {item.subject || 'No subject'}
            {item.decision_maker_name ? ` · ${item.decision_maker_name}` : ''}
            {item.to_email ? ` · ${item.to_email}` : ''}
          </p>
        </div>
        <span className="text-[11px] text-text-dim shrink-0">Step {item.step}</span>
        <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
      </button>
    </Card>
  )
}

function OutreachEditor({
  item,
  onClose,
  onChange,
  onSent,
}: {
  item: Outreach | null
  onClose: () => void
  onChange: (o: Outreach) => void
  onSent: () => void
}) {
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [toEmail, setToEmail] = useState('')
  const [busy, setBusy] = useState<null | 'save' | 'approve' | 'unapprove' | 'send'>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (item) {
      setSubject(item.subject ?? '')
      setBodyText(item.body_text ?? '')
      setToEmail(item.to_email ?? '')
      setError(null)
    }
  }, [item])

  if (!item) return null

  const isDraft = item.status === 'draft'
  const isApproved = item.status === 'approved'
  const canSend = isApproved && !!toEmail.trim()

  async function patch(
    action: 'save' | 'approve' | 'unapprove',
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
      onChange(json.outreach as Outreach)
      if (action === 'approve') toast({ title: 'Approved — ready to send' })
      if (action === 'save') toast({ title: 'Saved' })
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
          <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
          <span>{item.company_name ?? 'Company'}</span>
          {item.decision_maker_name && <span>· {item.decision_maker_name}</span>}
          <span>· Step {item.step}</span>
          {item.voice && <span>· {item.voice} voice</span>}
        </div>

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

        {error && <p className="text-sm text-accent-warm">{error}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-border -mx-6 px-6 pt-4">
          <Button
            size="sm"
            variant="secondary"
            icon={<Save size={14} />}
            loading={busy === 'save'}
            onClick={() =>
              patch('save', { subject, body_text: bodyText, to_email: toEmail || null })
            }
          >
            Save
          </Button>

          {isApproved ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Undo2 size={14} />}
              loading={busy === 'unapprove'}
              onClick={() => patch('unapprove', { status: 'draft' })}
            >
              Unapprove
            </Button>
          ) : (
            <Button
              size="sm"
              icon={<Check size={14} />}
              loading={busy === 'approve'}
              disabled={!isDraft}
              onClick={() =>
                patch('approve', {
                  status: 'approved',
                  subject,
                  body_text: bodyText,
                  to_email: toEmail || null,
                })
              }
            >
              Approve
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
              Send
            </Button>
          </span>
        </div>
      </div>
    </Modal>
  )
}
