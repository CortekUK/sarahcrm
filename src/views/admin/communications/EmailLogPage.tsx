'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { formatDateTime, cn } from '@/lib/utils'
import { Search, Loader2, Mail, Eye } from 'lucide-react'

// Normalised shape covering BOTH sources: email_log (automations,
// transactional, invites) and communications (template/campaign sends).
interface EmailRow {
  id: string
  to_email: string
  subject: string | null
  html: string | null
  category: string | null
  status: string
  error: string | null
  resend_message_id: string | null
  created_at: string
  opened_at: string | null
  clicked_at: string | null
  // Where the row came from, for the type label / preview fallback.
  source: 'email_log' | 'communications'
  // For communications rows there's no stored HTML — keep the text snippet so
  // the preview pane has something to show.
  body_preview: string | null
}

// Friendly label for a raw category slug.
function categoryLabel(c: string | null): string {
  if (!c) return 'Email'
  if (c.startsWith('automation:')) {
    const flow = c.split(':')[1] ?? ''
    return `Automation · ${flow.replace(/_/g, ' ')}`
  }
  if (c.startsWith('campaign:')) {
    const name = c.slice('campaign:'.length)
    return `Campaign · ${name.replace(/_/g, ' ')}`
  }
  return c.replace(/_/g, ' ')
}

// Collapse a raw category into a coarse filter bucket so the prefixed
// automation:/campaign: slugs group under one chip each.
function categoryBucket(c: string | null): string {
  if (!c) return ''
  if (c.startsWith('automation:')) return 'automation'
  if (c.startsWith('campaign:')) return 'campaign'
  return c
}

// Best-effort recipient label for a communications row. supabase-js types the
// joined relations as arrays even on to-one joins, so we normalise both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function recipientFromComm(c: any): string {
  const member = Array.isArray(c.members) ? c.members[0] : c.members
  const profile = member
    ? Array.isArray(member.profiles)
      ? member.profiles[0]
      : member.profiles
    : null
  if (profile?.email) return profile.email
  const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim()
  if (name) return name
  if (c.member_id) return `member ${String(c.member_id).slice(0, 8)}…`
  return '—'
}

export function EmailLogPage() {
  const [rows, setRows] = useState<EmailRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [viewing, setViewing] = useState<EmailRow | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    // Pull both mail sources in parallel, normalise to one shape, merge, and
    // sort newest-first. email_log = automations/transactional/invites;
    // communications = template/campaign sends.
    const [logRes, commRes] = await Promise.all([
      supabase
        .from('email_log')
        .select('id, to_email, subject, html, category, status, error, resend_message_id, created_at')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('communications')
        .select(
          `id, member_id, template_name, subject, body_preview, status, sent_at, opened_at, clicked_at, resend_message_id, created_at,
           members(profiles(first_name, last_name, email))`,
        )
        .order('created_at', { ascending: false })
        .limit(300),
    ])

    const logRows: EmailRow[] = (logRes.data ?? []).map((r) => ({
      id: `log:${r.id}`,
      to_email: r.to_email,
      subject: r.subject,
      html: r.html,
      category: r.category,
      status: r.status,
      error: r.error,
      resend_message_id: r.resend_message_id,
      created_at: r.created_at,
      opened_at: null,
      clicked_at: null,
      source: 'email_log',
      body_preview: null,
    }))

    const commRows: EmailRow[] = (commRes.data ?? []).map((c) => ({
      id: `comm:${c.id}`,
      // communications has no recipient email column — pull the recipient's
      // email (or name) from the joined member profile; fall back to a short
      // member-id stub, then em dash, so the row is always identifiable.
      to_email: recipientFromComm(c),
      subject: c.subject,
      html: null,
      // Tag these as campaign sends so the type column/filter distinguishes them.
      category: c.template_name ? `campaign:${c.template_name}` : 'campaign',
      status: c.status,
      error: null,
      resend_message_id: c.resend_message_id,
      created_at: c.sent_at ?? c.created_at,
      opened_at: c.opened_at,
      clicked_at: c.clicked_at,
      source: 'communications',
      body_preview: c.body_preview,
    }))

    const merged = [...logRows, ...commRows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )
    setRows(merged)
    setLoading(false)
  }

  const categories = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => {
      if (r.category) set.add(categoryBucket(r.category))
    })
    return ['all', ...Array.from(set).sort()]
  }, [rows])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (categoryFilter !== 'all') {
        if (categoryBucket(r.category) !== categoryFilter) return false
      }
      if (!term) return true
      return (
        r.to_email.toLowerCase().includes(term) ||
        (r.subject ?? '').toLowerCase().includes(term) ||
        (r.category ?? '').toLowerCase().includes(term)
      )
    })
  }, [rows, search, categoryFilter])

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-3 text-text-muted">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading sent mail…
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl">
      <AdminPageHeader
        title="Sent mail"
        description="Every email the platform has sent — automations, booking and application emails, rejections, invites and admin alerts. Open any one to read exactly what went out."
        meta={<span className="text-xs text-text-dim">{rows.length} logged</span>}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipient, subject, category…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={cn(
                'px-3 py-1.5 text-xs rounded-full border transition-colors capitalize',
                categoryFilter === c
                  ? 'bg-gold text-white border-gold'
                  : 'bg-[var(--color-surface)] text-text-muted border-border hover:border-border-hover hover:text-text',
              )}
            >
              {c === 'all' ? 'All' : c.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <AdminEmptyState
              icon={Mail}
              title={rows.length === 0 ? 'No emails sent yet' : 'No matches'}
              description={
                rows.length === 0
                  ? 'Emails appear here the moment the platform sends them.'
                  : 'Try a different filter or clear your search.'
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer group"
                    onClick={() => setViewing(r)}
                  >
                    <TableCell className="text-sm text-text">{r.to_email}</TableCell>
                    <TableCell className="text-sm text-text-muted max-w-[280px] truncate">
                      {r.subject ?? '—'}
                    </TableCell>
                    <TableCell>
                      <span className="text-[11px] text-text-dim capitalize">
                        {categoryLabel(r.category)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === 'failed' || r.status === 'bounced' ? 'urgent' : 'info'
                        }
                        dot
                      >
                        {r.clicked_at ? 'clicked' : r.opened_at ? 'opened' : r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-text-muted text-xs whitespace-nowrap">
                      {formatDateTime(r.created_at)}
                    </TableCell>
                    <TableCell>
                      <Eye
                        size={14}
                        className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Email" size="lg">
        {viewing && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Meta label="To" value={viewing.to_email} />
              <Meta label="Type" value={categoryLabel(viewing.category)} />
              <Meta label="Subject" value={viewing.subject ?? '—'} />
              <Meta label="Sent" value={formatDateTime(viewing.created_at)} />
              <Meta label="Status" value={viewing.status} />
              {viewing.opened_at && (
                <Meta label="Opened" value={formatDateTime(viewing.opened_at)} />
              )}
              {viewing.clicked_at && (
                <Meta label="Clicked" value={formatDateTime(viewing.clicked_at)} />
              )}
              {viewing.resend_message_id && (
                <Meta label="Resend ID" value={viewing.resend_message_id} />
              )}
            </div>
            {viewing.error && (
              <p className="text-xs text-accent-warm border border-accent-warm/30 bg-accent-warm/5 rounded px-3 py-2">
                {viewing.error}
              </p>
            )}
            {/* Full rendered email, sandboxed. */}
            <div className="-mx-6 border-t border-border">
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={
                  viewing.html ??
                  (viewing.body_preview
                    ? `<p style="font-family:sans-serif;padding:24px;color:#444;line-height:1.6">${viewing.body_preview}</p>`
                    : '<p style="font-family:sans-serif;padding:24px;color:#888">No body stored.</p>')
                }
                className="w-full h-[55vh] bg-white"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-dim">
        {label}
      </span>
      <p className="text-text break-words">{value}</p>
    </div>
  )
}
