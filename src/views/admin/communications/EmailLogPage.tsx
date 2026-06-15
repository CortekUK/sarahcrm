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
}

// Friendly label for a raw category slug.
function categoryLabel(c: string | null): string {
  if (!c) return 'Email'
  if (c.startsWith('automation:')) {
    const flow = c.split(':')[1] ?? ''
    return `Automation · ${flow.replace(/_/g, ' ')}`
  }
  return c.replace(/_/g, ' ')
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
    const { data } = await supabase
      .from('email_log')
      .select('id, to_email, subject, html, category, status, error, resend_message_id, created_at')
      .order('created_at', { ascending: false })
      .limit(300)
    if (data) setRows(data as EmailRow[])
    setLoading(false)
  }

  const categories = useMemo(() => {
    const set = new Set<string>()
    rows.forEach((r) => {
      if (r.category) set.add(r.category.startsWith('automation:') ? 'automation' : r.category)
    })
    return ['all', ...Array.from(set).sort()]
  }, [rows])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (categoryFilter !== 'all') {
        const bucket = r.category?.startsWith('automation:') ? 'automation' : r.category ?? ''
        if (bucket !== categoryFilter) return false
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
                      <Badge variant={r.status === 'failed' ? 'urgent' : 'info'} dot>
                        {r.status}
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
                srcDoc={viewing.html ?? '<p style="font-family:sans-serif;padding:24px;color:#888">No body stored.</p>'}
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
