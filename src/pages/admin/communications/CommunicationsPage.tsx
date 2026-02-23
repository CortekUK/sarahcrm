import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../../lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card'
import { Badge } from '../../../components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/ui/Table'
import { Modal } from '../../../components/ui/Modal'
import { Input } from '../../../components/ui/Input'
import { Textarea } from '../../../components/ui/Textarea'
import { Button } from '../../../components/ui/Button'
import { formatDate, formatDateTime } from '../../../lib/utils'
import { cn } from '../../../lib/utils'
import { Mail, Zap, Clock, Send, Eye, MousePointerClick, FileText } from 'lucide-react'

// ── Types ───────────────────────────────────────────────

interface EmailTemplate {
  name: string
  trigger: string
  active: boolean
  subject: string
  body: string
}

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
    }
  }
}

type CommStatus = 'sent' | 'delivered' | 'opened' | 'draft'

// ── Static data ─────────────────────────────────────────

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    name: 'Booking Confirmation',
    trigger: 'Sent automatically when a member completes an event booking',
    active: true,
    subject: 'Your booking for {{event_name}} is confirmed',
    body: `Dear {{first_name}},

Thank you for booking your place at {{event_name}} on {{event_date}}.

Venue: {{venue_name}}
Time: {{event_time}}

We look forward to seeing you there. If you need to make any changes to your booking, please contact us.

Warm regards,
The Club by Sarah Restrick`,
  },
  {
    name: 'Introduction Notification',
    trigger: 'Sent to both members when a new introduction is created',
    active: true,
    subject: 'Introduction: Meet {{other_member_name}}',
    body: `Dear {{first_name}},

I'm delighted to introduce you to {{other_member_name}}, who I think you'll find a wonderful connection.

{{introduction_note}}

I've copied you both on this email so you can arrange a time to connect at your convenience.

Warm regards,
Sarah Restrick`,
  },
  {
    name: 'Event Reminder 7-Day',
    trigger: 'Sent 7 days before a booked event',
    active: true,
    subject: 'Reminder: {{event_name}} is in one week',
    body: `Dear {{first_name}},

Just a gentle reminder that {{event_name}} is taking place in one week on {{event_date}}.

Venue: {{venue_name}}
Time: {{event_time}}
Dress code: {{dress_code}}

We look forward to welcoming you.

Warm regards,
The Club by Sarah Restrick`,
  },
  {
    name: 'Event Reminder 1-Day',
    trigger: 'Sent 1 day before a booked event',
    active: true,
    subject: 'Tomorrow: {{event_name}}',
    body: `Dear {{first_name}},

This is a friendly reminder that {{event_name}} is tomorrow, {{event_date}}.

Venue: {{venue_name}}
Time: {{event_time}}

If you have any last-minute questions, don't hesitate to reach out.

See you there!

Warm regards,
The Club by Sarah Restrick`,
  },
  {
    name: 'Monthly Introduction Report',
    trigger: 'Sent on the 1st of each month with a summary of introductions',
    active: true,
    subject: 'Your Introduction Report for {{month_name}}',
    body: `Dear {{first_name}},

Here's your monthly introduction summary for {{month_name}}:

Introductions made: {{intro_count}}
Connections accepted: {{accepted_count}}

{{intro_summary}}

If you'd like to explore new connections, do let me know.

Warm regards,
Sarah Restrick`,
  },
  {
    name: 'Welcome New Member',
    trigger: 'Sent when a new member account is created',
    active: false,
    subject: 'Welcome to The Club, {{first_name}}!',
    body: `Dear {{first_name}},

Welcome to The Club by Sarah Restrick. We're thrilled to have you join our community of exceptional individuals.

Your member portal is now active and you can access it at any time to view upcoming events, manage your introductions, and update your profile.

As a next step, I'd love to arrange an introductory call to learn more about your interests and how we can best serve you.

Warm regards,
Sarah Restrick`,
  },
]

const AUTOMATION_RULES = [
  { name: 'Send booking confirmation when payment received', enabled: true, lastTriggered: '2026-02-14T10:30:00Z' },
  { name: 'Send intro follow-up 48hrs after introduction sent', enabled: true, lastTriggered: '2026-02-13T14:00:00Z' },
  { name: 'Send event reminder 7 days before event', enabled: true, lastTriggered: '2026-02-09T08:00:00Z' },
  { name: 'Send monthly intro report on 1st of month', enabled: false, lastTriggered: '2026-02-01T06:00:00Z' },
]

const commStatusBadge: Record<CommStatus, 'active' | 'upcoming' | 'draft' | 'info'> = {
  sent: 'info',
  delivered: 'upcoming',
  opened: 'active',
  draft: 'draft',
}

function deriveStatus(row: CommRow): CommStatus {
  if (row.opened_at) return 'opened'
  if (row.sent_at) return 'sent'
  return 'draft'
}

// ── Timeline helpers ────────────────────────────────────

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
  const [comms, setComms] = useState<CommRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toggleStates, setToggleStates] = useState<Record<number, boolean>>(
    Object.fromEntries(AUTOMATION_RULES.map((r, i) => [i, r.enabled]))
  )

  // Template modal state
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null)
  const [templateEdits, setTemplateEdits] = useState<Record<string, { subject: string; body: string; active: boolean }>>({})

  // Send detail modal state
  const [selectedComm, setSelectedComm] = useState<CommRow | null>(null)

  useEffect(() => {
    fetchComms()
  }, [])

  async function fetchComms() {
    const { data } = await supabase
      .from('communications')
      .select(`
        id, template_name, subject, status, sent_at, opened_at, created_at,
        member_id, channel, body_preview, clicked_at,
        members(profiles(first_name, last_name))
      `)
      .order('created_at', { ascending: false })
      .limit(10)

    if (data) setComms(data as unknown as CommRow[])
    setLoading(false)
  }

  // Get current template values (edited or original)
  function getTemplateValues(tpl: EmailTemplate) {
    const edits = templateEdits[tpl.name]
    return {
      subject: edits?.subject ?? tpl.subject,
      body: edits?.body ?? tpl.body,
      active: edits?.active ?? tpl.active,
    }
  }

  function handleTemplateSave() {
    // Values are already in templateEdits — just close the modal
    setSelectedTemplate(null)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-gold rounded-full animate-pulse" />
          <span className="text-sm text-text-muted">Loading communications...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-heading)] text-3xl font-semibold text-text">
          Communications
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Email templates, automations, and send history
        </p>
      </div>

      {/* Email Templates + Automation Rules — two column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Email Templates */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail size={16} className="text-gold" />
              <CardTitle>Email Templates</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {EMAIL_TEMPLATES.map((tpl) => {
                const values = getTemplateValues(tpl)
                return (
                  <div
                    key={tpl.name}
                    className="px-6 py-4 flex items-start justify-between gap-4 cursor-pointer hover:bg-surface-2 transition-colors"
                    onClick={() => setSelectedTemplate(tpl)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text">{tpl.name}</p>
                      <p className="text-xs text-text-dim mt-0.5">{tpl.trigger}</p>
                    </div>
                    <Badge variant={values.active ? 'active' : 'draft'} dot>
                      {values.active ? 'Active' : 'Draft'}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Automation Rules */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap size={16} className="text-gold" />
              <CardTitle>Automation Rules</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {AUTOMATION_RULES.map((rule, idx) => (
                <div key={idx} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text">{rule.name}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Clock size={12} className="text-text-dim" />
                      <p className="text-xs text-text-dim">
                        Last triggered: {formatDate(rule.lastTriggered)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setToggleStates((s) => ({ ...s, [idx]: !s[idx] }))
                    }
                    className={cn(
                      'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                      toggleStates[idx] ? 'bg-gold' : 'bg-border'
                    )}
                  >
                    <span
                      className={cn(
                        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform duration-200',
                        toggleStates[idx] ? 'translate-x-5' : 'translate-x-0'
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sends */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sends</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {comms.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-text-dim">No communications sent yet</p>
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
                  const name = `${comm.members?.profiles?.first_name ?? ''} ${comm.members?.profiles?.last_name ?? ''}`.trim() || 'Unknown'
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

      {/* ── Template Detail Modal ──────────────────────────── */}
      {selectedTemplate && (() => {
        const values = getTemplateValues(selectedTemplate)
        return (
          <Modal
            open={!!selectedTemplate}
            onClose={() => setSelectedTemplate(null)}
            title={selectedTemplate.name}
            size="lg"
          >
            <div className="space-y-6">
              {/* Status toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant={values.active ? 'active' : 'draft'} dot>
                    {values.active ? 'Active' : 'Draft'}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setTemplateEdits((prev) => ({
                      ...prev,
                      [selectedTemplate.name]: {
                        subject: values.subject,
                        body: values.body,
                        active: !values.active,
                      },
                    }))
                  }
                  className={cn(
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
                    values.active ? 'bg-gold' : 'bg-border'
                  )}
                >
                  <span
                    className={cn(
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform duration-200',
                      values.active ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>

              {/* Trigger (read-only) */}
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">Trigger</p>
                <p className="text-sm text-text-dim">{selectedTemplate.trigger}</p>
              </div>

              {/* Subject */}
              <Input
                label="Subject Line"
                value={values.subject}
                hint="Use {{variable}} for merge tags"
                onChange={(e) =>
                  setTemplateEdits((prev) => ({
                    ...prev,
                    [selectedTemplate.name]: {
                      subject: e.target.value,
                      body: values.body,
                      active: values.active,
                    },
                  }))
                }
              />

              {/* Body */}
              <Textarea
                label="Email Body"
                value={values.body}
                rows={12}
                hint="Use {{variable}} for merge tags like {{first_name}}, {{event_name}}"
                onChange={(e) =>
                  setTemplateEdits((prev) => ({
                    ...prev,
                    [selectedTemplate.name]: {
                      subject: values.subject,
                      body: e.target.value,
                      active: values.active,
                    },
                  }))
                }
              />

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setSelectedTemplate(null)}>
                  Close
                </Button>
                <Button variant="primary" onClick={handleTemplateSave}>
                  Save Changes
                </Button>
              </div>
            </div>
          </Modal>
        )
      })()}

      {/* ── Send Detail Modal ──────────────────────────────── */}
      {selectedComm && (() => {
        const name = `${selectedComm.members?.profiles?.first_name ?? ''} ${selectedComm.members?.profiles?.last_name ?? ''}`.trim() || 'Unknown'
        const status = deriveStatus(selectedComm)
        const timeline = buildTimeline(selectedComm)

        return (
          <Modal
            open={!!selectedComm}
            onClose={() => setSelectedComm(null)}
            title="Send Details"
            size="lg"
          >
            <div className="space-y-6">
              {/* Recipient + Status */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-medium text-text">{name}</p>
                </div>
                <Badge variant={commStatusBadge[status]} dot>
                  {status}
                </Badge>
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">Template</p>
                  <p className="text-sm text-text">{selectedComm.template_name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">Channel</p>
                  <p className="text-sm text-text capitalize">{selectedComm.channel || 'Email'}</p>
                </div>
              </div>

              {/* Subject */}
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">Subject</p>
                <p className="text-sm text-text">{selectedComm.subject || '—'}</p>
              </div>

              {/* Body preview */}
              {selectedComm.body_preview && (
                <div>
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-1">Body Preview</p>
                  <div className="bg-surface-2 rounded-lg p-4">
                    <p className="text-sm text-text-muted whitespace-pre-wrap">{selectedComm.body_preview}</p>
                  </div>
                </div>
              )}

              {/* Event timeline */}
              <div>
                <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">Timeline</p>
                <div className="space-y-3">
                  {timeline.map((event) => (
                    <div
                      key={event.label}
                      className={cn(
                        'flex items-center gap-3',
                        !event.timestamp && 'opacity-40'
                      )}
                    >
                      <div className={cn(
                        'flex items-center justify-center w-7 h-7 rounded-full',
                        event.timestamp ? 'bg-gold/10 text-gold' : 'bg-surface-2 text-text-dim'
                      )}>
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

              {/* Close */}
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
