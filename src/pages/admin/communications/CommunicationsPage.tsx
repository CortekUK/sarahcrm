import { useEffect, useState } from 'react'
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
import { formatDate } from '../../../lib/utils'
import { cn } from '../../../lib/utils'
import { Mail, Zap, Clock } from 'lucide-react'

// ── Static data ─────────────────────────────────────────

const EMAIL_TEMPLATES = [
  { name: 'Booking Confirmation', trigger: 'Sent automatically when a member completes an event booking', active: true },
  { name: 'Introduction Notification', trigger: 'Sent to both members when a new introduction is created', active: true },
  { name: 'Event Reminder 7-Day', trigger: 'Sent 7 days before a booked event', active: true },
  { name: 'Event Reminder 1-Day', trigger: 'Sent 1 day before a booked event', active: true },
  { name: 'Monthly Introduction Report', trigger: 'Sent on the 1st of each month with a summary of introductions', active: true },
  { name: 'Welcome New Member', trigger: 'Sent when a new member account is created', active: false },
]

const AUTOMATION_RULES = [
  { name: 'Send booking confirmation when payment received', enabled: true, lastTriggered: '2026-02-14T10:30:00Z' },
  { name: 'Send intro follow-up 48hrs after introduction sent', enabled: true, lastTriggered: '2026-02-13T14:00:00Z' },
  { name: 'Send event reminder 7 days before event', enabled: true, lastTriggered: '2026-02-09T08:00:00Z' },
  { name: 'Send monthly intro report on 1st of month', enabled: false, lastTriggered: '2026-02-01T06:00:00Z' },
]

// ── Types ───────────────────────────────────────────────

interface CommRow {
  id: string
  template_name: string | null
  subject: string | null
  status: string
  sent_at: string | null
  opened_at: string | null
  created_at: string
  members: {
    profiles: {
      first_name: string | null
      last_name: string | null
    }
  }
}

type CommStatus = 'sent' | 'delivered' | 'opened' | 'draft'

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

export function CommunicationsPage() {
  const [comms, setComms] = useState<CommRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toggleStates, setToggleStates] = useState<Record<number, boolean>>(
    Object.fromEntries(AUTOMATION_RULES.map((r, i) => [i, r.enabled]))
  )

  useEffect(() => {
    fetchComms()
  }, [])

  async function fetchComms() {
    const { data } = await supabase
      .from('communications')
      .select(`
        id, template_name, subject, status, sent_at, opened_at, created_at,
        members(profiles(first_name, last_name))
      `)
      .order('created_at', { ascending: false })
      .limit(10)

    if (data) setComms(data as unknown as CommRow[])
    setLoading(false)
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
              {EMAIL_TEMPLATES.map((tpl) => (
                <div key={tpl.name} className="px-6 py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text">{tpl.name}</p>
                    <p className="text-xs text-text-dim mt-0.5">{tpl.trigger}</p>
                  </div>
                  <Badge variant={tpl.active ? 'active' : 'draft'} dot>
                    {tpl.active ? 'Active' : 'Draft'}
                  </Badge>
                </div>
              ))}
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
                    <TableRow key={comm.id}>
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
    </div>
  )
}
