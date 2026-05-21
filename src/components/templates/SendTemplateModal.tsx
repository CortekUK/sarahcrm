'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui-shadcn/dialog'
import { Button } from '@/components/ui-shadcn/button'
import { Label } from '@/components/ui-shadcn/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui-shadcn/select'
import { ScrollArea } from '@/components/ui-shadcn/scroll-area'
import { Loader2, Send, Eye, AlertCircle, Check, Users, Calendar } from 'lucide-react'
import { toast } from '@/lib/hooks/use-toast'
import { createClient } from '@/lib/supabase/client'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { useProgress } from '@/components/admin/TopProgressBar'
import type { Template } from '@/lib/templates/types'

interface SendTemplateModalProps {
  template: Template | null
  open: boolean
  onClose: () => void
}

type RecipientKind = 'all_active' | 'event_attendees' | 'member_ids'

interface PreviewRow {
  member_id: string
  email: string
  subject: string
  body_preview: string
}

interface SendResponse {
  sent: number
  failed: number
  skipped: number
  total: number
  errors: Array<{ member_id: string; error: string }>
  preview: PreviewRow[]
  dry_run: boolean
}

export function SendTemplateModal({ template, open, onClose }: SendTemplateModalProps) {
  const [recipientKind, setRecipientKind] = useState<RecipientKind>('all_active')
  const [eventId, setEventId] = useState<string>('')
  const [events, setEvents] = useState<Array<{ id: string; title: string; start_date: string }>>([])
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const [eventCount, setEventCount] = useState<number | null>(null)
  const [previewRows, setPreviewRows] = useState<PreviewRow[] | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<SendResponse | null>(null)

  const supabase = createClient()
  const confirm = useConfirm()
  const progress = useProgress()

  useEffect(() => {
    if (!open) return
    // Reset state each time the modal opens
    setRecipientKind('all_active')
    setEventId('')
    setPreviewRows(null)
    setResult(null)

    // Load event list (upcoming) and active member count
    ;(async () => {
      const [{ data: evts }, { count }] = await Promise.all([
        supabase
          .from('events')
          .select('id, title, start_date')
          .gte('start_date', new Date().toISOString())
          .order('start_date', { ascending: true })
          .limit(20),
        supabase
          .from('members')
          .select('*', { count: 'exact', head: true })
          .eq('membership_status', 'active'),
      ])
      setEvents(evts ?? [])
      setMemberCount(count ?? 0)
    })()
  }, [open, supabase])

  // When the user picks an event, fetch its attendee count
  useEffect(() => {
    if (recipientKind !== 'event_attendees' || !eventId) {
      setEventCount(null)
      return
    }
    ;(async () => {
      const { count } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .in('status', ['confirmed', 'pending'])
      setEventCount(count ?? 0)
    })()
  }, [recipientKind, eventId, supabase])

  if (!template) return null

  const recipients = buildRecipientsPayload(recipientKind, eventId)
  const recipientsReady = !!recipients
  const expectedCount =
    recipientKind === 'all_active'
      ? memberCount
      : recipientKind === 'event_attendees'
        ? eventCount
        : null

  async function callApi(dryRun: boolean): Promise<SendResponse | null> {
    if (!recipients) {
      toast({ title: 'Pick recipients first', variant: 'destructive' })
      return null
    }
    const res = await progress.track(
      fetch('/api/communications/send-template', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          template_id: template!.id,
          recipients,
          event_id: eventId || null,
          dry_run: dryRun,
        }),
      }),
    )
    const json = await res.json()
    if (!res.ok) {
      toast({
        title: dryRun ? 'Preview failed' : 'Send failed',
        description: json.error || 'Unknown error',
        variant: 'destructive',
      })
      return null
    }
    return json as SendResponse
  }

  async function handlePreview() {
    setPreviewing(true)
    try {
      const json = await callApi(true)
      if (json) setPreviewRows(json.preview)
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSend() {
    const recipientLabel =
      expectedCount === null
        ? 'the selected recipients'
        : `${expectedCount} recipient${expectedCount === 1 ? '' : 's'}`
    const ok = await confirm({
      title: 'Send this email?',
      description: `"${template?.name}" will be delivered to ${recipientLabel} via Resend. You can't recall it once it's gone.`,
      confirmLabel: `Send to ${expectedCount ?? '?'}`,
      tone: 'warning',
    })
    if (!ok) return
    setSending(true)
    try {
      const json = await callApi(false)
      if (json) {
        setResult(json)
        if (json.failed === 0 && json.skipped === 0) {
          toast({
            title: 'All emails sent',
            description: `${json.sent} recipients received the email.`,
          })
        } else {
          toast({
            title: `Sent with ${json.failed + json.skipped} issue(s)`,
            description: `${json.sent} sent · ${json.failed} failed · ${json.skipped} skipped`,
            variant: json.sent === 0 ? 'destructive' : 'default',
          })
        }
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Send template</DialogTitle>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            <span className="font-medium text-[var(--color-text)]">{template.name}</span>
            {' · '}
            {template.subject || <span className="italic">no subject</span>}
          </p>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-6 px-6 space-y-4">
          {/* If we have a final result, show that instead of the form */}
          {result ? (
            <SendResultPanel result={result} />
          ) : (
            <>
              <div className="space-y-2">
                <Label className="text-xs">Recipients</Label>
                <Select value={recipientKind} onValueChange={(v: RecipientKind) => setRecipientKind(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_active">
                      <span className="inline-flex items-center gap-2">
                        <Users className="w-3.5 h-3.5" />
                        All active members
                      </span>
                    </SelectItem>
                    <SelectItem value="event_attendees">
                      <span className="inline-flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5" />
                        Attendees of an event
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {recipientKind === 'all_active' && memberCount !== null && (
                  <p className="text-xs text-[var(--color-text-dim)]">
                    {memberCount} active member{memberCount === 1 ? '' : 's'} will receive this email.
                  </p>
                )}
              </div>

              {recipientKind === 'event_attendees' && (
                <div className="space-y-2">
                  <Label className="text-xs">Event</Label>
                  <Select value={eventId} onValueChange={setEventId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pick an event…" />
                    </SelectTrigger>
                    <SelectContent>
                      {events.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          No upcoming events
                        </SelectItem>
                      ) : (
                        events.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.title} · {new Date(e.start_date).toLocaleDateString('en-GB')}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {eventId && eventCount !== null && (
                    <p className="text-xs text-[var(--color-text-dim)]">
                      {eventCount} attendee{eventCount === 1 ? '' : 's'} will receive this email.
                      {' '}Event-specific merge tags like <code className="text-[10px] bg-[var(--color-surface-2)] px-1 rounded">{'{{event_name}}'}</code> resolve automatically.
                    </p>
                  )}
                </div>
              )}

              {/* Preview section */}
              {previewRows && (
                <div className="border border-[var(--color-border)] rounded-md">
                  <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] flex items-center justify-between">
                    <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--color-text-muted)]">
                      Preview · first {previewRows.length} recipient{previewRows.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <ScrollArea className="max-h-[260px]">
                    <div className="divide-y divide-[var(--color-border)]">
                      {previewRows.map((p) => (
                        <div key={p.member_id} className="px-3 py-2.5">
                          <p className="text-[11px] text-[var(--color-text-dim)] mb-0.5">→ {p.email}</p>
                          <p className="text-sm font-medium text-[var(--color-text)]">{p.subject}</p>
                          <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-2">{p.body_preview}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t border-[var(--color-border)] pt-4 mt-2">
          {result ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={handlePreview}
                disabled={!recipientsReady || previewing || sending}
              >
                {previewing ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                )}
                Preview
              </Button>
              <Button
                onClick={handleSend}
                disabled={!recipientsReady || sending || previewing}
                className="bg-[var(--color-gold)] hover:bg-[var(--color-gold-dark)]"
              >
                {sending ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                )}
                Send {expectedCount !== null ? `(${expectedCount})` : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function buildRecipientsPayload(
  kind: RecipientKind,
  eventId: string,
):
  | { kind: 'all_active' }
  | { kind: 'event_attendees'; event_id: string }
  | null {
  if (kind === 'all_active') return { kind: 'all_active' }
  if (kind === 'event_attendees' && eventId) {
    return { kind: 'event_attendees', event_id: eventId }
  }
  return null
}

function SendResultPanel({ result }: { result: SendResponse }) {
  const total = result.total || result.sent + result.failed + result.skipped
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="Sent"
          value={result.sent}
          tone="success"
          icon={Check}
        />
        <Stat
          label="Failed"
          value={result.failed}
          tone={result.failed > 0 ? 'danger' : 'neutral'}
          icon={AlertCircle}
        />
        <Stat
          label="Skipped"
          value={result.skipped}
          tone={result.skipped > 0 ? 'warn' : 'neutral'}
          icon={AlertCircle}
        />
      </div>
      <p className="text-xs text-[var(--color-text-muted)] text-center">
        {result.sent} of {total} delivered to Resend. Logged to the communications feed.
      </p>
      {result.errors.length > 0 && (
        <div className="border border-[var(--color-border)] rounded-md">
          <div className="px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)]">
            <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--color-accent-warm)]">
              Issues ({result.errors.length})
            </p>
          </div>
          <ScrollArea className="max-h-[200px]">
            <div className="divide-y divide-[var(--color-border)]">
              {result.errors.slice(0, 20).map((e, i) => (
                <div key={i} className="px-3 py-2">
                  <p className="text-xs text-[var(--color-text-muted)]">
                    <span className="font-mono text-[10px]">{e.member_id.slice(0, 8)}</span> — {e.error}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: number
  tone: 'success' | 'danger' | 'warn' | 'neutral'
  icon: React.ComponentType<{ className?: string }>
}) {
  const toneClass = {
    success: 'border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 text-[var(--color-accent)]',
    danger: 'border-[var(--color-accent-warm)]/30 bg-[var(--color-accent-warm)]/5 text-[var(--color-accent-warm)]',
    warn: 'border-[var(--color-gold)]/30 bg-[var(--color-gold)]/5 text-[var(--color-gold)]',
    neutral: 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]',
  }[tone]
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-[0.15em]">{label}</span>
      </div>
      <p className="font-[family-name:var(--font-heading)] text-2xl font-semibold">{value}</p>
    </div>
  )
}
