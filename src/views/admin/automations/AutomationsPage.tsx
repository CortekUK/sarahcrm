'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { RefreshCw, Send, Loader2, Clock } from 'lucide-react'

interface FlowResult {
  flow: string
  label: string
  candidates: number
  alreadyHandled: number
  pending: number
  sent: number
  failed: number
  items: { ref_id: string; to: string; detail: string; status: string; error?: string }[]
}
interface RunResult {
  ok: boolean
  dryRun: boolean
  flows: FlowResult[]
  totals: { candidates: number; pending: number; sent: number; failed: number }
}

// What each flow does, in plain language — shown so the admin understands
// the machine without reading code.
const FLOW_HELP: Record<string, string> = {
  welcome_journey: 'New members at day 2 / 10 / 14 of membership — onboarding, intro targets, then an AI opportunity report.',
  renewal_cadence: 'Members renewing in 90 / 60 / 30 / 7 days — staged reminders; the final stage auto-renews or raises a retention task.',
  failed_payment: 'Members whose card payment failed — asks them to update it.',
  event_reminder: 'Attendees of an event happening soon — a pre-event reminder.',
  post_event_followup: 'Attendees of an event that finished 1–3 days ago.',
  guest_nurture: 'Past guests who aren’t members yet — a gentle invitation.',
  invoice_chasing: 'Members with an overdue or past-due balance.',
  intro_scheduled: 'Both members of a scheduled introduction.',
}

export function AutomationsPage() {
  const confirm = useConfirm()
  const [busy, setBusy] = useState<null | 'preview' | 'run'>(null)
  const [result, setResult] = useState<RunResult | null>(null)
  // The real send hour is the admin-configured `daily_send_hour` app_setting
  // (Europe/London), default 07:00 — read it so the copy never lies.
  const [sendHour, setSendHour] = useState<number>(7)

  // Load the preview automatically on open so the admin sees who's due
  // without clicking anything.
  useEffect(() => {
    call(true)
    loadSendHour()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadSendHour() {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'daily_send_hour')
      .maybeSingle()
    const v = data?.value
    if (typeof v === 'number') setSendHour(v)
    else if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) setSendHour(Number(v))
  }

  async function call(dryRun: boolean) {
    setBusy(dryRun ? 'preview' : 'run')
    // Keep the current list visible while refreshing (no blank flash).
    try {
      const res = await fetch(`/api/cron/automations${dryRun ? '?dryRun=true' : ''}`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = (await res.json()) as RunResult & { error?: string }
      if (!res.ok) {
        toast({ title: 'Failed', description: json.error ?? 'Could not run', variant: 'destructive' })
        return
      }
      setResult(json)
      if (!dryRun) {
        toast({
          title: 'Automations run',
          description: `${json.totals.sent} sent, ${json.totals.failed} failed.`,
        })
      }
    } catch {
      toast({ title: 'Failed', description: 'Network error', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  async function runForReal() {
    const ok = await confirm({
      title: 'Send automated emails now?',
      description:
        'This sends real emails to everyone currently due (renewals, failed payments, post-event, etc.). Anyone already emailed is skipped automatically. Preview first if unsure.',
      confirmLabel: 'Send now',
    })
    if (ok) call(false)
  }

  return (
    <div className="p-4 md:p-8">
      <AdminPageHeader
        title="Automations"
        description="Scheduled lifecycle emails — renewal reminders, failed-payment notices, post-event follow-ups, guest nurture, invoice chasing and introduction notifications. These run automatically every day; you can preview or run them here anytime."
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              icon={busy === 'preview' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              disabled={busy !== null}
              onClick={() => call(true)}
            >
              Refresh
            </Button>
            <Button
              icon={busy === 'run' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              disabled={busy !== null}
              onClick={runForReal}
            >
              Run now
            </Button>
          </div>
        }
      />

      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="flex items-start gap-3 text-sm text-text-muted">
            <Clock size={16} className="text-gold flex-shrink-0 mt-0.5" />
            <p>
              <span className="text-text font-medium">
                Runs daily at {String(sendHour).padStart(2, '0')}:00 (UK).
              </span>{' '}
              Use{' '}
              <span className="text-text">Preview</span> to see exactly who would be emailed without
              sending anything, then <span className="text-text">Run now</span> to send. Each person
              is only emailed once per situation — running again is always safe.
            </p>
          </div>
        </CardContent>
      </Card>

      {!result && busy === 'preview' && (
        <div className="flex items-center gap-2 text-sm text-text-muted py-6">
          <Loader2 size={15} className="animate-spin text-gold" />
          Checking who&apos;s due…
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Badge variant={result.dryRun ? 'info' : 'active'} dot>
              {result.dryRun ? 'Preview' : 'Sent'}
            </Badge>
            {busy === 'preview' && (
              <Loader2 size={13} className="animate-spin text-text-dim" />
            )}
            <span className="text-sm text-text-muted">
              {result.dryRun
                ? `${result.totals.pending} email(s) would be sent`
                : `${result.totals.sent} sent · ${result.totals.failed} failed`}
            </span>
          </div>

          {result.flows.map((f) => (
            <Card key={f.flow}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h3 className="text-sm font-medium text-text">{f.label}</h3>
                  <span className="text-xs text-text-dim">
                    {result.dryRun
                      ? `${f.pending} to send · ${f.alreadyHandled} already done`
                      : `${f.sent} sent · ${f.failed} failed · ${f.alreadyHandled} already done`}
                  </span>
                </div>
                <p className="text-xs text-text-dim mb-3">{FLOW_HELP[f.flow] ?? ''}</p>
                {f.items.length === 0 ? (
                  <p className="text-xs text-text-dim italic">Nobody due right now.</p>
                ) : (
                  <ul className="space-y-1">
                    {f.items.map((it) => (
                      <li
                        key={it.ref_id}
                        className="flex items-center justify-between gap-3 text-[13px] py-1 border-b border-border/50 last:border-0"
                      >
                        <span className="text-text-muted truncate">
                          {it.detail} <span className="text-text-dim">· {it.to}</span>
                        </span>
                        <Badge
                          variant={
                            it.status === 'sent'
                              ? 'active'
                              : it.status === 'failed'
                                ? 'urgent'
                                : 'info'
                          }
                        >
                          {it.status === 'would_send' ? 'would send' : it.status}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
