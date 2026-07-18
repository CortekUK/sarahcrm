'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from '@/lib/hooks/use-toast'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table'
import { formatDateTime } from '@/lib/utils'
import { MessageCircle } from 'lucide-react'

// Sample templates offered in the composer. `hello_world` is Meta's default
// approved sample; add more approved template names here as they're created
// in the WABA. Free-text is handled separately (mode = 'text').
const TEMPLATES: { value: string; label: string; languageCode: string }[] = [
  { value: 'hello_world', label: 'hello_world (sample)', languageCode: 'en_US' },
]

interface WhatsAppLogRow {
  id: string
  to_phone: string
  direction: string
  template_name: string | null
  body: string | null
  status: string
  created_at: string
}

// Map log status → Badge variant (colour by outcome).
const statusBadge: Record<string, 'active' | 'upcoming' | 'draft' | 'urgent' | 'info'> = {
  sent: 'upcoming',
  delivered: 'active',
  read: 'active',
  received: 'info',
  failed: 'urgent',
}

export function WhatsAppPage() {
  const [mode, setMode] = useState<'template' | 'text'>('template')
  const [to, setTo] = useState('')
  const [templateName, setTemplateName] = useState(TEMPLATES[0]?.value ?? 'hello_world')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const [logs, setLogs] = useState<WhatsAppLogRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchLogs()
  }, [])

  async function fetchLogs() {
    const { data } = await supabase
      .from('whatsapp_log')
      .select('id, to_phone, direction, template_name, body, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50)
    setLogs((data ?? []) as WhatsAppLogRow[])
    setLoading(false)
  }

  async function handleSend() {
    if (!to.trim()) {
      toast({ title: 'Add a recipient number', variant: 'destructive' })
      return
    }
    if (mode === 'text' && !text.trim()) {
      toast({ title: 'Add a message', variant: 'destructive' })
      return
    }
    setSending(true)
    try {
      const selected = TEMPLATES.find((t) => t.value === templateName)
      const res = await fetch('/api/admin/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: to.trim(),
          mode,
          templateName: mode === 'template' ? templateName : undefined,
          languageCode: mode === 'template' ? selected?.languageCode ?? 'en_US' : undefined,
          text: mode === 'text' ? text : undefined,
        }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        toast({
          title: 'Could not send',
          description: json.error || 'WhatsApp send failed.',
          variant: 'destructive',
        })
        return
      }
      toast({ title: 'WhatsApp sent' })
      if (mode === 'text') setText('')
      await fetchLogs()
    } catch (e) {
      toast({
        title: 'Could not send',
        description: e instanceof Error ? e.message : 'Unexpected error',
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-8">
      <AdminPageHeader
        title="WhatsApp"
        description="Send WhatsApp messages to members and guests via the Meta Cloud API, and see everything that's been sent or received."
      />

      {/* ── Send ─────────────────────────────────────────── */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Send a message</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
                Mode
              </label>
              <SelectMenu
                ariaLabel="Message mode"
                value={mode}
                onValueChange={(v) => setMode(v as 'template' | 'text')}
                options={[
                  { value: 'template', label: 'Template' },
                  { value: 'text', label: 'Free text' },
                ]}
              />
            </div>
            <Input
              label="Recipient"
              placeholder="+44 7700 900123"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          {mode === 'template' ? (
            <div className="mt-4 space-y-1.5">
              <label className="block font-[family-name:var(--font-label)] text-[0.6875rem] font-medium uppercase tracking-[0.15em] text-text-muted">
                Template
              </label>
              <SelectMenu
                ariaLabel="Template"
                value={templateName}
                onValueChange={setTemplateName}
                options={TEMPLATES.map((t) => ({ value: t.value, label: t.label }))}
              />
            </div>
          ) : (
            <div className="mt-4">
              <Textarea
                label="Message"
                placeholder="Type your message…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          )}

          <p className="mt-4 text-xs text-text-muted leading-relaxed">
            Test-number note: messages deliver only to numbers on Meta&rsquo;s allow-list. Free-text
            reaches a recipient only inside the 24-hour window after they last messaged you —
            otherwise send an approved template (e.g. <code>hello_world</code>).
          </p>

          <div className="mt-5 flex justify-end">
            <Button onClick={handleSend} loading={sending}>
              Send
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Recent messages ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Recent messages</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm text-text-dim">Loading…</p>
            </div>
          ) : logs.length === 0 ? (
            <AdminEmptyState
              icon={MessageCircle}
              title="No messages yet"
              description="WhatsApp messages you send — and replies you receive — will appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Time</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>To / From</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-text-muted whitespace-nowrap">
                      {formatDateTime(l.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.direction === 'inbound' ? 'info' : 'draft'}>
                        {l.direction}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums text-text-muted">{l.to_phone}</TableCell>
                    <TableCell className="max-w-[280px] truncate text-text-muted">
                      {l.template_name ? `Template: ${l.template_name}` : l.body || '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadge[l.status] ?? 'draft'} dot>
                        {l.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
