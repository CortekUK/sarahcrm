'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DateField } from '@/components/ui/DateField'
import { Badge } from '@/components/ui/Badge'
import { useConfirm } from '@/components/admin/ConfirmDialog'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import {
  Plus, Trash2, Copy, Sparkles, Send, BarChart3, ListChecks, Loader2, ExternalLink,
  FileText, Eye, EyeOff, Download,
} from 'lucide-react'

// Per-sponsor management surface — the delivery checklist plus the AI
// proposal + post-event ROI report actions, and the read-only Sponsor
// Portal link. Deliverables are CRUD'd directly against Supabase (admin
// RLS); proposal/ROI go through the admin API routes (service role + AI).
//
// The portal is served at /sponsor/<booking_token> — we REUSE the existing
// per-sponsor booking_token as the portal token rather than minting a new one.

interface Deliverable {
  id: string
  label: string
  category: string | null
  due_date: string | null
  status: string
  notes: string | null
  file_path: string | null
  file_name: string | null
  sponsor_note: string | null
  submitted_at: string | null
}

const SPONSOR_ASSETS_BUCKET = 'sponsor-assets'

const CATEGORY_OPTIONS = [
  { value: 'asset', label: 'Asset required' },
  { value: 'branding', label: 'Branding deadline' },
  { value: 'guest_allocation', label: 'Guest allocation' },
  { value: 'other', label: 'Other' },
]
const CATEGORY_LABEL: Record<string, string> = {
  asset: 'Asset', branding: 'Branding', guest_allocation: 'Guests', other: 'Other',
}
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'received', label: 'Received' },
  { value: 'done', label: 'Done' },
]
const STATUS_VARIANT: Record<string, 'info' | 'active' | 'draft'> = {
  pending: 'draft', received: 'info', done: 'active',
}

export interface ManageSponsor {
  id: string
  booking_token: string
  sponsor_label: string
  proposal_html: string | null
  roi_report_html: string | null
  roi_reach: number | null
}

export function SponsorManageModal({
  sponsor,
  onClose,
}: {
  sponsor: ManageSponsor | null
  onClose: () => void
}) {
  const confirm = useConfirm()
  const [items, setItems] = useState<Deliverable[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [label, setLabel] = useState('')
  const [category, setCategory] = useState('asset')
  const [dueDate, setDueDate] = useState('')
  const [status, setStatus] = useState('pending')

  // The generated documents themselves — held in state so the in-modal
  // preview refreshes when the admin (re)generates without a reload.
  const [proposalHtml, setProposalHtml] = useState<string | null>(null)
  const [roiHtml, setRoiHtml] = useState<string | null>(null)
  const [roiReach, setRoiReach] = useState<number | null>(null)
  const [showProposal, setShowProposal] = useState(false)
  const [showRoi, setShowRoi] = useState(true)
  const [busy, setBusy] = useState<null | 'proposal' | 'send' | 'roi'>(null)

  const hasProposal = !!proposalHtml
  const hasRoi = !!roiHtml

  useEffect(() => {
    if (!sponsor) return
    setProposalHtml(sponsor.proposal_html)
    setRoiHtml(sponsor.roi_report_html)
    setRoiReach(sponsor.roi_reach)
    setShowProposal(false)
    setShowRoi(true)
    fetchDeliverables(sponsor.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sponsor?.id])

  async function fetchDeliverables(sponsorshipId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('sponsor_deliverables')
      .select('id, label, category, due_date, status, notes, file_path, file_name, sponsor_note, submitted_at')
      .eq('sponsorship_id', sponsorshipId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    setItems((data as Deliverable[]) ?? [])
    setLoading(false)
  }

  async function addDeliverable() {
    if (!sponsor) return
    if (!label.trim()) {
      toast({ title: 'Add a label', description: 'e.g. Logo (vector), Roller banner.', variant: 'destructive' })
      return
    }
    setSaving(true)
    const { error } = await supabase.from('sponsor_deliverables').insert({
      sponsorship_id: sponsor.id,
      label: label.trim(),
      category,
      due_date: dueDate || null,
      status,
    })
    setSaving(false)
    if (error) {
      toast({ title: 'Could not add', description: error.message, variant: 'destructive' })
      return
    }
    setLabel(''); setDueDate(''); setStatus('pending'); setCategory('asset')
    fetchDeliverables(sponsor.id)
  }

  async function changeStatus(id: string, next: string) {
    const prev = items
    setItems((list) => list.map((d) => (d.id === id ? { ...d, status: next } : d)))
    const { error } = await supabase.from('sponsor_deliverables').update({ status: next }).eq('id', id)
    if (error) {
      setItems(prev)
      toast({ title: 'Could not update', description: error.message, variant: 'destructive' })
    }
  }

  // Sponsor-uploaded files live in the PRIVATE sponsor-assets bucket. Open
  // them via a short-lived signed URL (same approach as the member-documents
  // vault) — the admin session's storage read policy authorises it.
  async function downloadFile(d: Deliverable) {
    if (!d.file_path) return
    const { data, error } = await supabase.storage
      .from(SPONSOR_ASSETS_BUCKET)
      .createSignedUrl(d.file_path, 60)
    if (error || !data?.signedUrl) {
      toast({ title: 'Could not open file', description: error?.message, variant: 'destructive' })
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function removeDeliverable(d: Deliverable) {
    const ok = await confirm({
      title: 'Remove this item?',
      description: <span><strong className="text-text">{d.label}</strong> will be removed from the checklist.</span>,
      confirmLabel: 'Remove',
      tone: 'danger',
    })
    if (!ok) return
    const { error } = await supabase.from('sponsor_deliverables').delete().eq('id', d.id)
    if (error) {
      toast({ title: 'Could not remove', description: error.message, variant: 'destructive' })
      return
    }
    setItems((list) => list.filter((x) => x.id !== d.id))
  }

  async function generateProposal() {
    if (!sponsor) return
    setBusy('proposal')
    try {
      const res = await fetch('/api/admin/sponsors/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorship_id: sponsor.id, action: 'generate' }),
      })
      const json = (await res.json()) as { ok?: boolean; proposal_html?: string; error?: string }
      if (!res.ok || !json.ok) {
        toast({ title: 'Could not generate', description: json.error ?? 'Failed', variant: 'destructive' })
        return
      }
      setProposalHtml(json.proposal_html ?? '')
      setShowProposal(true)
      toast({ title: 'Proposal generated', description: 'Review it below, then email it to the sponsor.' })
    } catch {
      toast({ title: 'Could not generate', description: 'Network error', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  async function emailProposal() {
    if (!sponsor) return
    setBusy('send')
    try {
      const res = await fetch('/api/admin/sponsors/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorship_id: sponsor.id, action: 'send' }),
      })
      const json = (await res.json()) as { ok?: boolean; to?: string; error?: string }
      if (!res.ok || !json.ok) {
        toast({ title: 'Could not send', description: json.error ?? 'Failed', variant: 'destructive' })
        return
      }
      toast({ title: 'Proposal sent', description: `Emailed to ${json.to}.` })
    } catch {
      toast({ title: 'Could not send', description: 'Network error', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  async function generateRoi() {
    if (!sponsor) return
    setBusy('roi')
    try {
      const res = await fetch('/api/admin/sponsors/roi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorship_id: sponsor.id }),
      })
      const json = (await res.json()) as {
        ok?: boolean
        roi_report_html?: string
        stats?: { attended?: number }
        error?: string
      }
      if (!res.ok || !json.ok) {
        toast({ title: 'Could not generate', description: json.error ?? 'Failed', variant: 'destructive' })
        return
      }
      setRoiHtml(json.roi_report_html ?? '')
      if (typeof json.stats?.attended === 'number') setRoiReach(json.stats.attended)
      setShowRoi(true)
      toast({ title: 'ROI report generated', description: 'Shown below and on the sponsor portal.' })
    } catch {
      toast({ title: 'Could not generate', description: 'Network error', variant: 'destructive' })
    } finally {
      setBusy(null)
    }
  }

  function portalLink(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/sponsor/${sponsor?.booking_token ?? ''}`
  }

  async function copyPortalLink() {
    try {
      await navigator.clipboard.writeText(portalLink())
      toast({ title: 'Portal link copied', description: 'The sponsor’s private portal link is on your clipboard.' })
    } catch {
      toast({ title: 'Could not copy', description: portalLink(), variant: 'destructive' })
    }
  }

  return (
    <Modal open={!!sponsor} onClose={onClose} title={sponsor ? `Manage — ${sponsor.sponsor_label}` : ''} size="lg">
      {sponsor && (
        <div className="space-y-7">
          {/* ── Documents: proposal + ROI ─────────────────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wide text-text-dim mb-3 flex items-center gap-2">
              <Sparkles size={13} /> Proposal &amp; ROI report
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={busy === 'proposal' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                disabled={busy !== null}
                onClick={generateProposal}
              >
                {hasProposal ? 'Regenerate proposal' : 'Generate proposal'}
              </Button>
              {hasProposal && (
                <Button
                  size="sm"
                  icon={busy === 'send' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  disabled={busy !== null}
                  onClick={emailProposal}
                >
                  Email to sponsor
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                icon={busy === 'roi' ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
                disabled={busy !== null}
                onClick={generateRoi}
              >
                {hasRoi ? 'Regenerate ROI report' : 'Generate ROI report'}
              </Button>
            </div>
            <p className="text-xs text-text-dim mt-2">
              Proposal is written from the event, package and investment. The ROI report is built from the
              event&apos;s attendance after it has run — both appear on the sponsor portal.
            </p>

            {/* Proposal preview (collapsible) */}
            {hasProposal && (
              <div className="mt-4 rounded-[var(--radius-md)] border border-border overflow-hidden">
                <button
                  onClick={() => setShowProposal((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 bg-surface-2 hover:bg-surface-3 transition-colors text-left"
                >
                  <span className="inline-flex items-center gap-2 text-sm text-text">
                    <FileText size={14} className="text-gold" /> Proposal
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
                    {showProposal ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> View proposal</>}
                  </span>
                </button>
                {showProposal && (
                  <iframe
                    title="Sponsorship proposal preview"
                    srcDoc={proposalHtml ?? ''}
                    sandbox=""
                    className="w-full h-[560px] bg-white border-t border-border"
                  />
                )}
              </div>
            )}

            {/* ROI report — prominent once generated */}
            {hasRoi && (
              <div className="mt-4 rounded-[var(--radius-md)] border border-border-gold overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-3.5 py-3 bg-gold-muted">
                  <div className="inline-flex items-center gap-2.5">
                    <BarChart3 size={15} className="text-gold-dark" />
                    <span className="text-sm font-medium text-text">ROI report</span>
                    {typeof roiReach === 'number' && (
                      <span className="inline-flex items-baseline gap-1.5">
                        <span className="text-base font-semibold text-text tabular-nums">{roiReach}</span>
                        <span className="text-[11px] uppercase tracking-wide text-text-dim">guests reached</span>
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setShowRoi((v) => !v)}
                    className="inline-flex items-center gap-1.5 text-xs text-gold-dark hover:text-text transition-colors"
                  >
                    {showRoi ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> View report</>}
                  </button>
                </div>
                {showRoi && (
                  <iframe
                    title="Sponsor ROI report preview"
                    srcDoc={roiHtml ?? ''}
                    sandbox=""
                    className="w-full h-[560px] bg-white border-t border-border-gold"
                  />
                )}
              </div>
            )}
          </section>

          {/* ── Portal link ───────────────────────────────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wide text-text-dim mb-3 flex items-center gap-2">
              <ExternalLink size={13} /> Sponsor portal
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={copyPortalLink}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-xs text-text-muted bg-surface-2 hover:text-text hover:bg-surface-3 transition-colors"
              >
                <Copy size={13} /> Copy portal link
              </button>
              <a
                href={portalLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[var(--radius-md)] text-xs text-gold-dark bg-gold-muted hover:bg-gold-muted/80 transition-colors"
              >
                <ExternalLink size={13} /> Open portal
              </a>
            </div>
          </section>

          {/* ── Delivery checklist ────────────────────────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wide text-text-dim mb-3 flex items-center gap-2">
              <ListChecks size={13} /> Delivery checklist ({items.length})
            </h3>

            {/* Add form — kept ABOVE the list so the Category/Status
                dropdowns open into clear space and never collide with the
                modal footer. */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <Input
                label="New item"
                placeholder="e.g. Logo (vector), Roller banner, 4 guest passes"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Button icon={<Plus size={15} />} loading={saving} onClick={addDeliverable}>
                Add
              </Button>
              <Select
                label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={CATEGORY_OPTIONS}
              />
              <div className="grid grid-cols-2 gap-3">
                <DateField label="Due date" value={dueDate} onChange={setDueDate} />
                <Select
                  label="Status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  options={STATUS_OPTIONS}
                />
              </div>
            </div>

            {/* Current deliverables */}
            {loading ? (
              <p className="text-sm text-text-dim py-3 mt-4">Loading checklist…</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-text-dim py-2 mt-4">
                No deliverables yet — add branding deadlines, assets required and guest allocation above.
              </p>
            ) : (
              <div className="mt-5 divide-y divide-border rounded-[var(--radius-md)] border border-border">
                {items.map((d) => (
                  <div key={d.id} className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text truncate">{d.label}</p>
                        <p className="text-[11px] text-text-dim">
                          {d.category ? CATEGORY_LABEL[d.category] ?? d.category : 'Other'}
                          {d.due_date ? ` · due ${formatDate(d.due_date)}` : ''}
                          {d.submitted_at ? ` · provided ${formatDate(d.submitted_at)}` : ''}
                        </p>
                      </div>
                      <Badge variant={STATUS_VARIANT[d.status] ?? 'neutral'}>{d.status}</Badge>
                      <div className="w-[130px] shrink-0">
                        <Select
                          options={STATUS_OPTIONS}
                          value={d.status}
                          onChange={(e) => changeStatus(d.id, e.target.value)}
                        />
                      </div>
                      <button
                        onClick={() => removeDeliverable(d)}
                        className="shrink-0 w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center text-text-dim hover:text-accent-warm hover:bg-surface-2 transition-colors"
                        aria-label="Remove item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* What the sponsor sent — download + their note */}
                    {(d.file_path || d.sponsor_note) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-0.5">
                        {d.file_path && (
                          <button
                            onClick={() => downloadFile(d)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-md)] text-xs text-gold-dark bg-gold-muted hover:bg-gold-muted/80 transition-colors"
                          >
                            <Download size={13} /> {d.file_name ?? 'Download file'}
                          </button>
                        )}
                        {d.sponsor_note && (
                          <span className="text-xs text-text-dim italic">“{d.sponsor_note}”</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Bottom breathing room so an open dropdown never touches the
              modal's bottom edge / footer. */}
          <div className="h-2" />
        </div>
      )}
      <div className="-mx-6 -mb-4 mt-6 px-6 py-4 border-t border-border flex items-center justify-end gap-3 bg-surface rounded-b-[var(--radius-xl)]">
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  )
}
