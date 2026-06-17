'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Send, CalendarClock, Sparkles, Mail, AlertCircle, MousePointerClick, Check, X } from 'lucide-react'
import { DateTimeField } from '@/components/ui/DateTimeField'
import { defaultIntroEmail } from '@/lib/introductions/intro-email'

export interface ComposeMember {
  id: string
  first_name: string | null
  name: string
  company: string | null
  email: string | null
}

type SideResult = 'idle' | 'sent' | 'scheduled'

interface SideState {
  subject: string
  body: string
  templateId: string
  date: string
  showSchedule: boolean
  busy: boolean
  result: SideResult
  scheduledFor: string
  declined: boolean // declined previously → editable + re-send
}

interface TemplateRow {
  id: string
  name: string
  subject: string | null
  body_html: string | null
}

const blankSide: SideState = {
  subject: '',
  body: '',
  templateId: '',
  date: '',
  showSchedule: false,
  busy: false,
  result: 'idle',
  scheduledFor: '',
  declined: false,
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*p\s*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?'
}

interface SideInitial {
  sentAt: string | null
  scheduledAt: string | null
  response?: 'pending' | 'accepted' | 'declined'
}

export function IntroComposeModal({
  open,
  onClose,
  introId,
  memberA,
  memberB,
  matchReason,
  initial,
  onSent,
}: {
  open: boolean
  onClose: () => void
  introId: string | null
  memberA: ComposeMember | null
  memberB: ComposeMember | null
  matchReason: string | null
  initial?: { a: SideInitial; b: SideInitial } | null
  onSent: () => void
}) {
  const [a, setA] = useState<SideState>(blankSide)
  const [b, setB] = useState<SideState>(blankSide)
  const [templates, setTemplates] = useState<TemplateRow[]>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase
      .from('email_templates')
      .select('id, name, subject, body_html')
      .order('name')
      .then(({ data }) => setTemplates((data as TemplateRow[]) ?? []))
  }, [open])

  useEffect(() => {
    if (open && memberA && memberB) {
      const da = defaultIntroEmail(memberA.first_name, memberB.name, memberB.company, matchReason)
      const db = defaultIntroEmail(memberB.first_name, memberA.name, memberA.company, matchReason)
      const seed = (init: SideInitial | undefined): Pick<SideState, 'result' | 'scheduledFor' | 'declined'> => {
        // A declined side stays editable so Sarah can re-send.
        if (init?.response === 'declined') return { result: 'idle', scheduledFor: '', declined: true }
        return {
          result: init?.sentAt ? 'sent' : init?.scheduledAt ? 'scheduled' : 'idle',
          scheduledFor: init?.scheduledAt ?? '',
          declined: false,
        }
      }
      setA({ ...blankSide, subject: da.subject, body: da.body, ...seed(initial?.a) })
      setB({ ...blankSide, subject: db.subject, body: db.body, ...seed(initial?.b) })
      setDirty(false)
    }
  }, [open, introId, memberA, memberB, matchReason, initial])

  function applyTemplate(side: 'a' | 'b', templateId: string) {
    const set = side === 'a' ? setA : setB
    const member = side === 'a' ? memberA : memberB
    const other = side === 'a' ? memberB : memberA
    if (!templateId) {
      const d = defaultIntroEmail(member?.first_name ?? null, other?.name ?? '', other?.company ?? null, matchReason)
      set((s) => ({ ...s, templateId: '', subject: d.subject, body: d.body }))
      return
    }
    const t = templates.find((x) => x.id === templateId)
    if (!t) return
    set((s) => ({ ...s, templateId, subject: t.subject || s.subject, body: t.body_html ? htmlToText(t.body_html) : s.body }))
  }

  // Send or schedule a SINGLE side immediately; the other side is left as 'skip'.
  async function submitSide(side: 'a' | 'b', mode: 'now' | 'schedule') {
    const s = side === 'a' ? a : b
    const set = side === 'a' ? setA : setB
    if (!introId) return
    if (mode === 'schedule' && !s.date) {
      toast({ title: 'Pick a date', description: 'Choose a date to schedule this email.', variant: 'destructive' })
      return
    }
    set((x) => ({ ...x, busy: true }))
    try {
      const acting = { action: mode, date: mode === 'schedule' ? s.date : undefined, subject: s.subject, body: s.body }
      const res = await fetch('/api/admin/introductions/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          introduction_id: introId,
          a: side === 'a' ? acting : { action: 'skip' },
          b: side === 'b' ? acting : { action: 'skip' },
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not send', description: json.error, variant: 'destructive' })
        set((x) => ({ ...x, busy: false }))
        return
      }
      const r = json.results?.[side]
      setDirty(true)
      if (mode === 'now') {
        if (r?.sent) {
          set((x) => ({ ...x, busy: false, result: 'sent', showSchedule: false }))
          toast({ title: 'Sent', description: `Email sent.` })
        } else {
          set((x) => ({ ...x, busy: false }))
          toast({ title: 'Not sent', description: r?.error || 'No email on file.', variant: 'destructive' })
        }
      } else {
        set((x) => ({ ...x, busy: false, result: 'scheduled', scheduledFor: s.date, showSchedule: false }))
        toast({ title: 'Scheduled', description: `Will send on ${s.date}.` })
      }
    } catch {
      set((x) => ({ ...x, busy: false }))
    }
  }

  function handleClose() {
    if (a.busy || b.busy) return
    if (dirty) onSent()
    else onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Review & send introduction" size="xl" className="!max-w-[1120px]">
      {memberA && memberB && (
        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border-gold bg-gradient-to-br from-gold-muted/70 via-surface to-surface p-3.5">
            <div className="pointer-events-none absolute -top-10 -right-8 h-24 w-24 rounded-full bg-gold/10 blur-3xl" />
            <div className="relative flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-gold-light to-gold text-white shadow-[0_3px_10px_rgba(184,151,90,0.35)]">
                <Sparkles size={15} strokeWidth={1.75} />
              </div>
              <p className="text-sm text-text">
                One email to each member, about the other.{' '}
                <span className="text-text-muted">Send or schedule each one independently.</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SideEditor label="First introduction" member={memberA} other={memberB} state={a} setState={setA} templates={templates} onTemplate={(id) => applyTemplate('a', id)} onSubmit={(m) => submitSide('a', m)} />
            <SideEditor label="Second introduction" member={memberB} other={memberA} state={b} setState={setB} templates={templates} onTemplate={(id) => applyTemplate('b', id)} onSubmit={(m) => submitSide('b', m)} />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-text-dim">The “View &amp; respond” button links each member to their portal.</p>
            <Button variant="ghost" onClick={handleClose} disabled={a.busy || b.busy}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function SideEditor({
  label,
  member,
  other,
  state,
  setState,
  templates,
  onTemplate,
  onSubmit,
}: {
  label: string
  member: ComposeMember
  other: ComposeMember
  state: SideState
  setState: React.Dispatch<React.SetStateAction<SideState>>
  templates: TemplateRow[]
  onTemplate: (id: string) => void
  onSubmit: (mode: 'now' | 'schedule') => void
}) {
  const noEmail = !member.email
  const done = state.result !== 'idle'

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface-2 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold ring-1 ring-gold/25 text-sm font-medium">
          {initials(member.name)}
        </div>
        <div className="min-w-0">
          <p className="font-[family-name:var(--font-label)] text-[9px] font-semibold uppercase tracking-[0.18em] text-text-dim">
            {label}
          </p>
          <p className="text-sm font-medium text-text truncate">{member.name}</p>
          <p className="flex items-center gap-1 text-xs text-text-dim truncate">
            <Mail size={11} /> {member.email || 'no email on file'}
          </p>
        </div>
      </div>

      <div className={cnFade(done)}>
        {noEmail && !done && (
          <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-accent-warm/10 border border-accent-warm/25 p-2.5">
            <AlertCircle size={14} className="text-accent-warm mt-0.5 shrink-0" />
            <p className="text-xs text-text-muted">No email on file — this one can&apos;t be sent.</p>
          </div>
        )}
        {state.declined && state.result === 'idle' && (
          <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-accent-warm/10 border border-accent-warm/25 p-2.5">
            <AlertCircle size={14} className="text-accent-warm mt-0.5 shrink-0" />
            <p className="text-xs text-text-muted">
              {member.name} declined. Edit the message and re-send to try again.
            </p>
          </div>
        )}

        <Select
          label="Template"
          options={[{ value: '', label: 'Default introduction' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
          value={state.templateId}
          onChange={(e) => onTemplate(e.target.value)}
        />

        <Input label="Subject" value={state.subject} onChange={(e) => setState((s) => ({ ...s, subject: e.target.value }))} />

        <div>
          <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted mb-1.5">
            Message
          </label>
          <textarea
            value={state.body}
            onChange={(e) => setState((s) => ({ ...s, body: e.target.value }))}
            rows={12}
            className="w-full min-h-[260px] px-3.5 py-2.5 bg-surface text-text text-sm leading-relaxed rounded-[var(--radius-md)] border border-border outline-none transition-[border-color,box-shadow] duration-200 focus:border-gold focus:shadow-[0_0_0_3px_var(--color-gold-muted)] resize-y"
          />
          <p className="text-xs text-text-dim mt-1">About {other.name}. Blank lines separate paragraphs.</p>
        </div>

        <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-gold-muted/40 border border-border-gold px-3 py-2">
          <MousePointerClick size={14} className="text-gold shrink-0" />
          <p className="text-xs text-text-muted">
            A <span className="text-gold font-medium">“View &amp; respond”</span> button is added at the end of the email.
          </p>
        </div>
      </div>

      {/* Per-side actions — execute independently */}
      <div className="px-4 pb-4 pt-1">
        {state.result === 'sent' ? (
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-accent/10 border border-accent/25 px-3 py-2.5 text-sm text-accent">
            <Check size={15} /> Sent to {member.name}
          </div>
        ) : state.result === 'scheduled' ? (
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius-md)] bg-gold-muted/50 border border-border-gold px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm text-gold">
              <CalendarClock size={15} /> Scheduled for {state.scheduledFor}
            </span>
            <button
              type="button"
              onClick={() => setState((s) => ({ ...s, result: 'idle', scheduledFor: '' }))}
              className="text-text-dim hover:text-text"
              title="Change"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Button
                icon={<Send size={14} />}
                onClick={() => onSubmit('now')}
                loading={state.busy && !state.showSchedule}
                disabled={noEmail || state.busy}
                className="w-full justify-center"
              >
                {state.declined ? 'Re-send' : 'Send now'}
              </Button>
              <Button
                variant="secondary"
                icon={<CalendarClock size={14} />}
                onClick={() => setState((s) => ({ ...s, showSchedule: !s.showSchedule }))}
                disabled={noEmail || state.busy}
                className="w-full justify-center"
              >
                Schedule
              </Button>
            </div>
            {state.showSchedule && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <DateTimeField
                    dateOnly
                    min={new Date()}
                    placeholder="Pick a send date"
                    value={state.date}
                    onChange={(v) => setState((s) => ({ ...s, date: v }))}
                  />
                </div>
                <Button onClick={() => onSubmit('schedule')} loading={state.busy} disabled={!state.date} className="shrink-0">
                  Confirm
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Fade the editor once a side is sent/scheduled (read-only feel).
function cnFade(done: boolean): string {
  return `p-4 space-y-3 transition-opacity ${done ? 'opacity-60 pointer-events-none' : ''}`
}
