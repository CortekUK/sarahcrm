'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  Sparkles,
  Mail,
  Send,
  Eye,
  MousePointerClick,
  FileText,
  ChevronRight,
  Plus,
  AlertCircle,
  TrendingUp,
} from 'lucide-react'
import { useTemplates, useDeleteTemplate, useDuplicateTemplate } from '@/lib/hooks/useTemplates'
import { useTemplateStats } from '@/lib/hooks/useTemplateStats'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { toast } from '@/lib/hooks/use-toast'
import { SendTemplateModal } from '@/components/templates/SendTemplateModal'
import { previewMergeTags } from '@/lib/templates/preview-data'
import type { Template } from '@/lib/templates/types'

// ── Types ───────────────────────────────────────────────

interface CommRow {
  id: string
  template_name: string | null
  subject: string | null
  status: string
  sent_at: string | null
  opened_at: string | null
  created_at: string
  member_id: string | null
  channel: string | null
  body_preview: string | null
  clicked_at: string | null
  members: {
    profiles: {
      first_name: string | null
      last_name: string | null
    } | null
  } | null
}

type CommStatus = 'sent' | 'delivered' | 'opened' | 'failed' | 'queued' | 'draft'

const commStatusBadge: Record<CommStatus, 'active' | 'upcoming' | 'draft' | 'info' | 'urgent'> = {
  sent: 'info',
  delivered: 'upcoming',
  opened: 'active',
  failed: 'urgent',
  queued: 'draft',
  draft: 'draft',
}

function deriveStatus(row: CommRow): CommStatus {
  if (row.opened_at) return 'opened'
  if (row.status === 'failed') return 'failed'
  if (row.status === 'queued') return 'queued'
  if (row.sent_at) return 'sent'
  return 'draft'
}

interface TimelineEvent {
  label: string
  icon: ReactNode
  timestamp: string | null
}

function buildTimeline(comm: CommRow): TimelineEvent[] {
  return [
    { label: 'Created', icon: <FileText size={14} />, timestamp: comm.created_at },
    { label: 'Sent', icon: <Send size={14} />, timestamp: comm.sent_at },
    { label: 'Opened', icon: <Eye size={14} />, timestamp: comm.opened_at },
    { label: 'Clicked', icon: <MousePointerClick size={14} />, timestamp: comm.clicked_at },
  ]
}

// ── Component ───────────────────────────────────────────

export function CommunicationsPage() {
  const router = useRouter()
  const { data: user } = useCurrentUser()
  const isAdmin = user?.role === 'admin'

  const [comms, setComms] = useState<CommRow[]>([])
  const [commsLoading, setCommsLoading] = useState(true)
  const [selectedComm, setSelectedComm] = useState<CommRow | null>(null)
  const [sendTarget, setSendTarget] = useState<Template | null>(null)

  const { data: templates = [], isLoading: templatesLoading } = useTemplates({})
  const { data: stats } = useTemplateStats()
  const deleteTemplate = useDeleteTemplate()
  const duplicateTemplate = useDuplicateTemplate()

  useEffect(() => {
    fetchComms()
  }, [])

  async function fetchComms() {
    setCommsLoading(true)
    const { data } = await supabase
      .from('communications')
      .select(
        `
        id, template_name, subject, status, sent_at, opened_at, created_at,
        member_id, channel, body_preview, clicked_at,
        members(profiles(first_name, last_name))
        `,
      )
      .order('created_at', { ascending: false })
      .limit(15)
    if (data) setComms(data as unknown as CommRow[])
    setCommsLoading(false)
  }

  // Stats derived from real data
  const derivedStats = useMemo(() => {
    const totalTemplates = stats?.totalTemplates ?? templates.length
    const drafts = stats?.draftTemplates ?? templates.filter((t) => t.is_draft).length
    const last30 = new Date()
    last30.setDate(last30.getDate() - 30)
    const sentLast30 = comms.filter((c) => c.sent_at && new Date(c.sent_at) >= last30).length
    const opened = comms.filter((c) => c.opened_at).length
    const openRate = sentLast30 > 0 ? Math.round((opened / sentLast30) * 100) : null
    return { totalTemplates, drafts, sentLast30, openRate }
  }, [stats, templates, comms])

  if (!user) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <span className="text-sm">Loading…</span>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="p-8">
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-sm text-text-muted">Communications is admin-only.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-8 space-y-6">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
            Communications
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Member email templates, sends, and engagement
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => router.push('/dashboard/communications/templates/editor')}
          >
            <Plus size={16} />
            New template
          </Button>
          <Button
            variant="primary"
            onClick={() => router.push('/dashboard/communications/templates/editor')}
          >
            <Sparkles size={16} />
            Build with AI
          </Button>
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Templates" value={derivedStats.totalTemplates} icon={<Mail size={14} />} />
        <StatTile
          label="Drafts"
          value={derivedStats.drafts}
          icon={<FileText size={14} />}
          tone={derivedStats.drafts > 0 ? 'warn' : 'neutral'}
        />
        <StatTile label="Sent (30 days)" value={derivedStats.sentLast30} icon={<Send size={14} />} />
        <StatTile
          label="Open rate"
          value={derivedStats.openRate !== null ? `${derivedStats.openRate}%` : '—'}
          icon={<TrendingUp size={14} />}
          tone={derivedStats.openRate !== null && derivedStats.openRate >= 30 ? 'success' : 'neutral'}
        />
      </div>

      {/* ── AI builder hero CTA ─────────────────────────── */}
      <Link
        href="/dashboard/communications/templates/editor"
        className="block group relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-gradient-to-br from-[rgba(184,151,90,0.10)] via-[rgba(184,151,90,0.04)] to-transparent p-6 transition-all hover:shadow-[var(--shadow-card-hover)] hover:border-gold/40"
      >
        <div className="flex items-center gap-5">
          <div className="flex-shrink-0 w-14 h-14 rounded-[var(--radius-lg)] bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center shadow-[var(--shadow-md)]">
            <Sparkles size={24} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-[family-name:var(--font-heading)] text-xl font-semibold text-text">
              AI Email Template Builder
            </p>
            <p className="text-sm text-text-muted mt-1">
              Describe an email in plain English. The assistant drafts it on a visual canvas with
              your merge tags, brand colours, and Sarah&apos;s voice — ready to send to members.
            </p>
          </div>
          <ChevronRight
            size={20}
            className="text-text-dim group-hover:text-gold group-hover:translate-x-1 transition-all"
          />
        </div>
      </Link>

      {/* ── Templates ───────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Templates</CardTitle>
            <p className="text-xs text-text-dim mt-0.5">Your saved email designs</p>
          </div>
          <Link
            href="/dashboard/communications/templates"
            className="text-xs text-gold hover:text-gold-dark font-medium flex items-center gap-1"
          >
            Manage all
            <ChevronRight size={12} />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {templatesLoading ? (
            <div className="p-12 text-center text-sm text-text-dim">Loading…</div>
          ) : templates.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gold-muted mb-3">
                <Mail size={18} className="text-gold" />
              </div>
              <p className="text-sm font-medium text-text">No templates yet</p>
              <p className="text-xs text-text-dim mt-1 max-w-sm mx-auto">
                Build your first member email with the AI assistant.
              </p>
              <Button
                variant="primary"
                className="mt-4"
                onClick={() => router.push('/dashboard/communications/templates/editor')}
              >
                <Sparkles size={14} />
                Build with AI
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Name</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right pr-4">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.slice(0, 6).map((tpl) => (
                  <TableRow
                    key={tpl.id}
                    className="cursor-pointer"
                    onClick={() =>
                      router.push(`/dashboard/communications/templates/editor?id=${tpl.id}`)
                    }
                  >
                    <TableCell className="font-medium text-text">
                      {previewMergeTags(tpl.name) || tpl.name}
                    </TableCell>
                    <TableCell className="text-text-muted max-w-[240px] truncate">
                      {tpl.subject ? (
                        previewMergeTags(tpl.subject)
                      ) : (
                        <span className="text-text-dim italic">No subject</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="info" dot>
                        {tpl.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={tpl.is_draft ? 'draft' : 'active'} dot>
                        {tpl.is_draft ? 'Draft' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-text-muted">{formatDate(tpl.updated_at)}</TableCell>
                    <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setSendTarget(tpl)}
                        disabled={tpl.is_draft}
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                          tpl.is_draft
                            ? 'text-text-dim cursor-not-allowed bg-surface-2'
                            : 'text-white bg-gold hover:bg-gold-dark',
                        )}
                        title={tpl.is_draft ? 'Drafts cannot be sent — finish the template first' : 'Send to members'}
                      >
                        <Send size={12} />
                        Send
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Recent Sends ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Recent sends</CardTitle>
          <p className="text-xs text-text-dim mt-0.5">
            Latest emails delivered to members — opens and clicks track via Resend webhooks
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {commsLoading ? (
            <div className="p-12 text-center text-sm text-text-dim">Loading…</div>
          ) : comms.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-surface-2 mb-3">
                <Send size={18} className="text-text-dim" />
              </div>
              <p className="text-sm font-medium text-text">No sends yet</p>
              <p className="text-xs text-text-dim mt-1 max-w-sm mx-auto">
                When you send a template to members, the activity will show up here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Recipient</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comms.map((comm) => {
                  const name =
                    `${comm.members?.profiles?.first_name ?? ''} ${comm.members?.profiles?.last_name ?? ''}`.trim() ||
                    'Unknown'
                  const status = deriveStatus(comm)
                  return (
                    <TableRow
                      key={comm.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedComm(comm)}
                    >
                      <TableCell className="font-medium text-text">{name}</TableCell>
                      <TableCell className="text-text-muted">
                        {comm.template_name || '—'}
                      </TableCell>
                      <TableCell className="text-text-muted max-w-[250px] truncate">
                        {comm.subject || '—'}
                      </TableCell>
                      <TableCell className="text-text-muted">
                        {comm.sent_at ? formatDate(comm.sent_at) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={commStatusBadge[status]} dot>
                          {status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Send modal ──────────────────────────────────── */}
      <SendTemplateModal
        template={sendTarget}
        open={!!sendTarget}
        onClose={() => {
          setSendTarget(null)
          // refresh sends after a possible send completes
          fetchComms()
        }}
      />

      {/* ── Send detail modal ───────────────────────────── */}
      {selectedComm && (() => {
        const name =
          `${selectedComm.members?.profiles?.first_name ?? ''} ${selectedComm.members?.profiles?.last_name ?? ''}`.trim() ||
          'Unknown'
        const status = deriveStatus(selectedComm)
        const timeline = buildTimeline(selectedComm)
        return (
          <Modal
            open={!!selectedComm}
            onClose={() => setSelectedComm(null)}
            title="Send details"
            size="lg"
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-lg font-medium text-text">{name}</p>
                <Badge variant={commStatusBadge[status]} dot>
                  {status}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                    Template
                  </p>
                  <p className="text-sm text-text">{selectedComm.template_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                    Channel
                  </p>
                  <p className="text-sm text-text capitalize">{selectedComm.channel || 'Email'}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                  Subject
                </p>
                <p className="text-sm text-text">{selectedComm.subject || '—'}</p>
              </div>

              {selectedComm.body_preview && (
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">
                    Body preview
                  </p>
                  <div className="bg-surface-2 rounded-lg p-4">
                    <p className="text-sm text-text-muted whitespace-pre-wrap">
                      {selectedComm.body_preview}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
                  Timeline
                </p>
                <div className="space-y-3">
                  {timeline.map((event) => (
                    <div
                      key={event.label}
                      className={cn(
                        'flex items-center gap-3',
                        !event.timestamp && 'opacity-40',
                      )}
                    >
                      <div
                        className={cn(
                          'flex items-center justify-center w-7 h-7 rounded-full',
                          event.timestamp ? 'bg-gold/10 text-gold' : 'bg-surface-2 text-text-dim',
                        )}
                      >
                        {event.icon}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-text">{event.label}</p>
                      </div>
                      <p className="text-xs text-text-dim">
                        {event.timestamp ? formatDateTime(event.timestamp) : '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button variant="ghost" onClick={() => setSelectedComm(null)}>
                  Close
                </Button>
              </div>
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}

function StatTile({
  label,
  value,
  icon,
  tone = 'neutral',
}: {
  label: string
  value: number | string
  icon: ReactNode
  tone?: 'neutral' | 'success' | 'warn'
}) {
  const toneClass = {
    neutral: 'text-text-muted',
    success: 'text-accent',
    warn: 'text-gold',
  }[tone]
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-1.5">
          <span className={toneClass}>{icon}</span>
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
            {label}
          </p>
        </div>
        <p className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text mt-2">
          {value}
        </p>
      </CardContent>
    </Card>
  )
}

// Silence unused warning since AlertCircle is reserved for future error states
void AlertCircle
