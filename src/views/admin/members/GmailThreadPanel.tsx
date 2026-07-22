'use client'

// Per-contact Gmail conversation history + AI-drafted replies. Reads synced
// messages from public.gmail_messages (populated by /api/cron/gmail-sync),
// groups them into threads, and lets an admin generate an AI reply that is
// saved as a DRAFT in Gmail (never sent). Mirrors MemberDocumentsPanel: a
// self-fetching { memberId } panel reading Supabase directly.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { toast } from '@/lib/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import { Mail, Sparkles, Loader2, ChevronDown, ChevronRight, Send } from 'lucide-react'
import type { Database } from '@/types/database'

type Msg = Database['public']['Tables']['gmail_messages']['Row']

interface Thread {
  threadId: string
  subject: string
  messages: Msg[]
  lastAt: string
}

function groupThreads(msgs: Msg[]): Thread[] {
  const byThread = new Map<string, Msg[]>()
  for (const m of msgs) {
    const arr = byThread.get(m.gmail_thread_id) ?? []
    arr.push(m)
    byThread.set(m.gmail_thread_id, arr)
  }
  const threads: Thread[] = []
  for (const [threadId, list] of byThread) {
    list.sort((a, b) => a.internal_date.localeCompare(b.internal_date))
    threads.push({
      threadId,
      subject: list[0].subject ?? '(no subject)',
      messages: list,
      lastAt: list[list.length - 1].internal_date,
    })
  }
  threads.sort((a, b) => b.lastAt.localeCompare(a.lastAt))
  return threads
}

export function GmailThreadPanel({ memberId }: { memberId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const [openThread, setOpenThread] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('gmail_messages')
        .select('*')
        .eq('member_id', memberId)
        .order('internal_date', { ascending: false })
        .limit(500)
      if (!cancelled) {
        setMsgs(data ?? [])
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [memberId])

  const threads = groupThreads(msgs)

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail size={16} className="text-gold" /> Emails
        </CardTitle>
        <p className="text-sm text-text-muted mt-1">
          Conversation history synced from the connected inbox. AI-drafted replies are saved as
          Gmail drafts for review — nothing is sent automatically.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading emails…
          </div>
        ) : threads.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-text-dim py-4">
            <Mail size={15} /> No emails found for this contact yet.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {threads.map((t) => (
              <ThreadRow
                key={t.threadId}
                thread={t}
                open={openThread === t.threadId}
                onToggle={() => setOpenThread((cur) => (cur === t.threadId ? null : t.threadId))}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ThreadRow({ thread, open, onToggle }: { thread: Thread; open: boolean; onToggle: () => void }) {
  return (
    <div className="py-3">
      <button onClick={onToggle} className="flex items-center gap-2 w-full text-left">
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <span className="text-sm font-medium text-text truncate flex-1">{thread.subject}</span>
        <span className="text-xs text-text-dim shrink-0">
          {thread.messages.length} · {formatDate(thread.lastAt)}
        </span>
      </button>
      {open && (
        <div className="mt-3 pl-6 space-y-3">
          {thread.messages.map((m) => (
            <div
              key={m.id}
              className={`rounded-[var(--radius-md)] border border-border p-3 ${
                m.direction === 'outbound' ? 'bg-gold-muted/40' : 'bg-surface'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-text">
                  {m.direction === 'outbound' ? 'Sent' : 'Received'} · {m.from_email}
                </span>
                <span className="text-xs text-text-dim">{formatDate(m.internal_date)}</span>
              </div>
              <p className="text-sm text-text-muted whitespace-pre-wrap line-clamp-[12]">
                {m.body_text || m.snippet}
              </p>
            </div>
          ))}
          <DraftReply threadId={thread.threadId} />
        </div>
      )}
    </div>
  )
}

function DraftReply({ threadId }: { threadId: string }) {
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<{ subject: string; body_html: string } | null>(null)

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/google/gmail/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to draft reply')
      setDraft({ subject: json.subject, body_html: json.body_html })
    } catch (e) {
      toast({ title: 'Could not draft reply', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setGenerating(false)
    }
  }

  async function saveToGmail() {
    if (!draft) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/google/gmail/create-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId, subject: draft.subject, body_html: draft.body_html }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to save draft')
      toast({ title: 'Draft saved to Gmail', description: 'Open Gmail to review and send.' })
      setDraft(null)
    } catch (e) {
      toast({ title: 'Could not save draft', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pt-1">
      {!draft ? (
        <Button
          variant="secondary"
          size="sm"
          disabled={generating}
          icon={generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          onClick={generate}
        >
          Draft reply with AI
        </Button>
      ) : (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-gold/40 p-3">
          <input
            className="w-full text-sm bg-transparent border border-border rounded px-2 py-1.5 text-text"
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          />
          <textarea
            className="w-full text-sm bg-transparent border border-border rounded px-2 py-1.5 text-text min-h-[140px] font-mono"
            value={draft.body_html}
            onChange={(e) => setDraft({ ...draft, body_html: e.target.value })}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={saving}
              icon={saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              onClick={saveToGmail}
            >
              Save as Gmail draft
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
