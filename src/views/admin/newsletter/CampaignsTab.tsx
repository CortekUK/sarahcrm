'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { toast } from '@/lib/hooks/use-toast'
import { previewMergeTags } from '@/lib/templates/preview-data'
import { formatDateTime, cn } from '@/lib/utils'
import { Send, Plus, Search, AlertCircle, ChevronRight, Eye } from 'lucide-react'
import type { Database } from '@/types/database'

type Campaign = Database['public']['Tables']['email_campaigns']['Row']
type Audience = Database['public']['Tables']['audiences']['Row']

interface TemplateLite {
  id: string
  name: string
  subject: string
  body_html: string
  category: string
}

const statusBadge: Record<string, 'active' | 'upcoming' | 'urgent' | 'draft' | 'info'> = {
  draft: 'draft',
  queued: 'upcoming',
  sending: 'info',
  sent: 'active',
  failed: 'urgent',
}

export function CampaignsTab() {
  const [rows, setRows] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)
  const [previewTarget, setPreviewTarget] = useState<Campaign | null>(null)

  useEffect(() => {
    fetchCampaigns()
  }, [])

  async function fetchCampaigns() {
    setLoading(true)
    const { data, error } = await supabase
      .from('email_campaigns')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      toast({ title: 'Failed to load campaigns', description: error.message, variant: 'destructive' })
    } else {
      setRows((data ?? []) as Campaign[])
    }
    setLoading(false)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-text-muted">
          Campaign history. Drafts let you preview before sending. Once sent the
          subject/body is snapshotted so editing the source template won&apos;t rewrite
          history.
        </p>
        <Button onClick={() => setNewOpen(true)}>
          <Plus size={14} />
          New campaign
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-text-dim">Loading…</div>
          ) : rows.length === 0 ? (
            <AdminEmptyState
              icon={Send}
              title="No campaigns yet"
              description="Create your first campaign — pick a template from /communications and send to a list."
              action={
                <Button onClick={() => setNewOpen(true)}>
                  <Plus size={14} />
                  New campaign
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Recipients</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">View</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-text">
                      {previewMergeTags(c.name) || c.name}
                      <p className="text-xs text-text-dim font-normal">
                        {previewMergeTags(c.subject)}
                      </p>
                    </TableCell>
                    <TableCell className="text-text-muted">{c.audience_label ?? '—'}</TableCell>
                    <TableCell className="text-text-muted">
                      {c.sent_count}/{c.recipient_count}
                      {c.failed_count > 0 && (
                        <span className="ml-1 text-accent-warm">({c.failed_count} failed)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadge[c.status] ?? 'draft'} dot className="capitalize">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-text-muted text-xs whitespace-nowrap">
                      {formatDateTime(c.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => setPreviewTarget(c)}
                        className="p-1.5 rounded text-text-dim hover:text-text hover:bg-surface-2"
                      >
                        <Eye size={14} />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {newOpen && (
        <NewCampaignModal
          onClose={() => setNewOpen(false)}
          onSent={() => {
            setNewOpen(false)
            fetchCampaigns()
          }}
        />
      )}
      {previewTarget && (
        <CampaignPreviewModal
          campaign={previewTarget}
          onClose={() => setPreviewTarget(null)}
        />
      )}
    </>
  )
}

// ─── New campaign modal — pick template + audience, preview, send ────

function NewCampaignModal({
  onClose,
  onSent,
}: {
  onClose: () => void
  onSent: () => void
}) {
  const [step, setStep] = useState<'template' | 'audience' | 'review'>('template')
  const [templates, setTemplates] = useState<TemplateLite[]>([])
  const [audiences, setAudiences] = useState<Audience[]>([])
  const [audienceCounts, setAudienceCounts] = useState<Record<string, { subs: number; members: number }>>({})
  const [allSubsCount, setAllSubsCount] = useState(0)
  const [tmplSearch, setTmplSearch] = useState('')
  const [tmplPick, setTmplPick] = useState<TemplateLite | null>(null)
  // null audienceId means "all active subscribers"
  const [audiencePick, setAudiencePick] = useState<Audience | null>(null)
  const [useAllSubs, setUseAllSubs] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [tplRes, audRes, subCount] = await Promise.all([
        supabase
          .from('email_templates')
          .select('id, name, subject, body_html, category')
          .eq('category', 'campaign')
          .eq('is_draft', false)
          .order('updated_at', { ascending: false }),
        supabase.from('audiences').select('*').order('created_at', { ascending: false }),
        supabase
          .from('mailing_list')
          .select('id', { count: 'exact', head: true })
          .is('unsubscribed_at', null),
      ])
      if (cancelled) return
      setTemplates((tplRes.data ?? []) as TemplateLite[])
      setAudiences((audRes.data ?? []) as Audience[])
      setAllSubsCount(subCount.count ?? 0)
      // Count rows per audience
      const counts: Record<string, { subs: number; members: number }> = {}
      for (const a of audRes.data ?? []) {
        const { data: rows } = await supabase
          .from('audience_members')
          .select('subscriber_id, member_id')
          .eq('audience_id', a.id)
        const subs = (rows ?? []).filter((r) => r.subscriber_id).length
        const members = (rows ?? []).filter((r) => r.member_id).length
        counts[a.id] = { subs, members }
      }
      if (cancelled) return
      setAudienceCounts(counts)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredTemplates = useMemo(() => {
    const t = tmplSearch.trim().toLowerCase()
    if (!t) return templates
    return templates.filter(
      (x) => x.name.toLowerCase().includes(t) || x.subject.toLowerCase().includes(t),
    )
  }, [templates, tmplSearch])

  function audienceLabel(): string {
    if (useAllSubs) return 'All active subscribers'
    return audiencePick?.name ?? '—'
  }

  function recipientCount(): number {
    if (useAllSubs) return allSubsCount
    if (!audiencePick) return 0
    const c = audienceCounts[audiencePick.id] ?? { subs: 0, members: 0 }
    return c.subs + c.members
  }

  async function send() {
    if (!tmplPick) return
    setError(null)
    setSending(true)
    const payload = {
      template_id: tmplPick.id,
      audience_id: useAllSubs ? null : audiencePick?.id ?? null,
    }
    const res = await fetch('/api/admin/campaigns/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({}))
    setSending(false)
    if (!res.ok) {
      setError(json.error || 'Send failed')
      // Still close on configured-but-deferred response so the draft
      // appears in history. The route returns 202 in that case.
      return
    }
    toast({
      title: json.delivered
        ? `Campaign sent to ${json.sent_count} recipients`
        : 'Draft saved (SMTP not configured yet)',
    })
    onSent()
  }

  return (
    <Modal open onClose={onClose} title="New campaign" size="xl">
      <div className="mb-5 flex items-center gap-2 text-xs text-text-muted">
        <Crumb active={step === 'template'} done={!!tmplPick}>
          1. Template
        </Crumb>
        <ChevronRight size={12} className="text-text-dim" />
        <Crumb active={step === 'audience'} done={useAllSubs || !!audiencePick}>
          2. Audience
        </Crumb>
        <ChevronRight size={12} className="text-text-dim" />
        <Crumb active={step === 'review'}>3. Review &amp; send</Crumb>
      </div>

      {/* ── Step 1: template ───────────────────────────────────── */}
      {step === 'template' && (
        <div className="space-y-4">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
            <Input
              value={tmplSearch}
              onChange={(e) => setTmplSearch(e.target.value)}
              placeholder="Search campaign templates…"
              className="pl-9"
            />
          </div>
          <div className="max-h-[400px] overflow-y-auto border border-border rounded-md divide-y divide-border">
            {filteredTemplates.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-text-dim">
                No campaign-type templates yet. Create one under{' '}
                <a className="text-gold" href="/dashboard/communications/templates">
                  Communications &gt; AI Templates
                </a>{' '}
                with category &quot;campaign&quot;.
              </div>
            ) : (
              filteredTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTmplPick(t)}
                  className={cn(
                    'w-full text-left px-4 py-3 transition-colors',
                    tmplPick?.id === t.id ? 'bg-gold-muted/40' : 'hover:bg-surface-2',
                  )}
                >
                  <p className="text-sm font-medium text-text">
                    {previewMergeTags(t.name) || t.name}
                  </p>
                  <p className="text-xs text-text-muted truncate">{previewMergeTags(t.subject)}</p>
                </button>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!tmplPick} onClick={() => setStep('audience')}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: audience ───────────────────────────────────── */}
      {step === 'audience' && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setUseAllSubs(true)
              setAudiencePick(null)
            }}
            className={cn(
              'w-full text-left p-4 border rounded-md transition-colors',
              useAllSubs ? 'border-gold bg-gold-muted/40' : 'border-border hover:bg-surface-2',
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-text">All active subscribers</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Anyone who signed up via the public form and hasn&apos;t unsubscribed.
                </p>
              </div>
              <Badge variant="info">{allSubsCount}</Badge>
            </div>
          </button>

          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted mb-2">
              Or pick a custom list
            </p>
            <div className="max-h-[280px] overflow-y-auto border border-border rounded-md divide-y divide-border">
              {audiences.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-text-dim">
                  No custom lists yet. Create one in the Lists tab.
                </div>
              ) : (
                audiences.map((a) => {
                  const c = audienceCounts[a.id] ?? { subs: 0, members: 0 }
                  const total = c.subs + c.members
                  const active = !useAllSubs && audiencePick?.id === a.id
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setUseAllSubs(false)
                        setAudiencePick(a)
                      }}
                      className={cn(
                        'w-full text-left px-4 py-3 transition-colors',
                        active ? 'bg-gold-muted/40' : 'hover:bg-surface-2',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text">{a.name}</p>
                          <p className="text-xs text-text-muted truncate">
                            {c.subs} subscribers · {c.members} members
                          </p>
                        </div>
                        <Badge variant="info">{total}</Badge>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="flex justify-between pt-1">
            <Button variant="ghost" onClick={() => setStep('template')}>
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                disabled={!useAllSubs && !audiencePick}
                onClick={() => setStep('review')}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 3: review + send ──────────────────────────────── */}
      {step === 'review' && tmplPick && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <ReviewCell label="Template">{tmplPick.name}</ReviewCell>
            <ReviewCell label="Audience">{audienceLabel()}</ReviewCell>
            <ReviewCell label="Subject">{previewMergeTags(tmplPick.subject)}</ReviewCell>
            <ReviewCell label="Recipients">{recipientCount()}</ReviewCell>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted mb-2">
              Preview (sample data substituted for merge tags)
            </p>
            <div className="border border-border rounded-md max-h-[280px] overflow-y-auto bg-white p-4">
              <iframe
                title="Preview"
                srcDoc={previewMergeTags(tmplPick.body_html)}
                className="w-full min-h-[260px] border-0"
              />
            </div>
          </div>

          <div className="flex items-start gap-2 px-3 py-2.5 bg-accent-warm/10 border border-accent-warm/30 rounded-md text-xs text-accent-warm">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <p>
              Hitting send saves the campaign and queues delivery. If a custom SMTP
              provider isn&apos;t configured yet, the campaign is saved as a draft —
              once Resend is wired up, this same button will deliver immediately.
            </p>
          </div>

          {error && <p className="text-xs text-accent-warm">{error}</p>}

          <div className="flex justify-between pt-1">
            <Button variant="ghost" onClick={() => setStep('audience')}>
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={send} loading={sending}>
                <Send size={14} />
                Send to {recipientCount()} {recipientCount() === 1 ? 'recipient' : 'recipients'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Crumb({
  active,
  done,
  children,
}: {
  active: boolean
  done?: boolean
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'px-2.5 py-1 rounded-md',
        active && 'bg-gold-muted text-gold',
        !active && done && 'text-accent',
        !active && !done && 'text-text-dim',
      )}
    >
      {children}
    </span>
  )
}

function ReviewCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-md p-3 bg-surface-2/40">
      <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted">{label}</p>
      <p className="text-sm text-text mt-1 break-words">{children}</p>
    </div>
  )
}

// ─── Preview existing campaign ──────────────────────────────────────

function CampaignPreviewModal({
  campaign,
  onClose,
}: {
  campaign: Campaign
  onClose: () => void
}) {
  return (
    <Modal open onClose={onClose} title={previewMergeTags(campaign.name) || campaign.name} size="xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <ReviewCell label="Subject">{previewMergeTags(campaign.subject)}</ReviewCell>
          <ReviewCell label="Audience">{campaign.audience_label ?? '—'}</ReviewCell>
          <ReviewCell label="Status">
            <Badge variant={statusBadge[campaign.status] ?? 'draft'} dot className="capitalize">
              {campaign.status}
            </Badge>
          </ReviewCell>
          <ReviewCell label="Recipients">
            {campaign.sent_count}/{campaign.recipient_count}
            {campaign.failed_count > 0 ? ` · ${campaign.failed_count} failed` : ''}
          </ReviewCell>
        </div>
        {campaign.error_message && (
          <div className="px-3 py-2.5 bg-accent-warm/10 border border-accent-warm/30 rounded-md text-xs text-accent-warm">
            {campaign.error_message}
          </div>
        )}
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-text-muted mb-2">
            Snapshot of what was sent
          </p>
          <div className="border border-border rounded-md max-h-[360px] overflow-y-auto bg-white p-4">
            <iframe
              title="Preview"
              srcDoc={previewMergeTags(campaign.body_html)}
              className="w-full min-h-[320px] border-0"
            />
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  )
}

