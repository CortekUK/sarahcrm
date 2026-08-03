// GET /api/admin/inbox/thread/[threadId]
//
// Full message feed for one Gmail thread, oldest-first. Access is enforced HERE:
// every message's mailbox must be in the caller's allowed set (rows from other
// mailboxes are filtered out; a thread with no accessible rows is 403/404).
//
// Rich HTML is fetched LAZILY: gmail_messages only stores stripped body_text
// from the sync path, so the first time a message is opened we pull the real
// text/html from Gmail (impersonating that message's mailbox), sanitize it, and
// persist it to body_html so subsequent opens are instant. Already-stored HTML
// is re-sanitized defensively on every read. The live fetch is wrapped per
// message — any failure degrades to the escaped body_text, never a 500.
//
// Opening a thread also marks it read for the caller (inbox_read_state upsert).

import { NextRequest } from 'next/server'
import { requireInboxAccess } from '@/lib/inbox/guard'
import { canAccessMailbox } from '@/lib/inbox/access'
import { sanitizeEmailHtml } from '@/lib/inbox/sanitize-email'
import { getMessageHtml } from '@/lib/google/gmail'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface MessageRow {
  id: string
  gmail_message_id: string
  gmail_thread_id: string
  direction: string
  from_email: string | null
  to_emails: string[] | null
  subject: string | null
  snippet: string | null
  body_text: string | null
  body_html: string | null
  internal_date: string
  mailbox: string | null
}

// Escapes plain text into safe HTML (fallback when the live fetch fails).
function escapeTextToHtml(text: string | null): string {
  if (!text) return ''
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${escaped}</pre>`
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const auth = await requireInboxAccess()
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })

  const { allowed, admin } = auth
  const { threadId } = await params

  const { data, error } = await admin
    .from('gmail_messages')
    .select(
      'id, gmail_message_id, gmail_thread_id, direction, from_email, to_emails, subject, snippet, body_text, body_html, internal_date, mailbox',
    )
    .eq('gmail_thread_id', threadId)
    .order('internal_date', { ascending: true })

  if (error) {
    console.error('[inbox/thread] load error', error)
    return Response.json({ error: 'Failed to load thread' }, { status: 500 })
  }

  const all = (data ?? []) as MessageRow[]
  if (all.length === 0) {
    return Response.json({ error: 'Thread not found' }, { status: 404 })
  }

  // Enforce mailbox access: keep only rows the caller may read.
  const rows = all.filter((m) => canAccessMailbox(allowed, m.mailbox))
  if (rows.length === 0) {
    return Response.json({ error: 'No access to this thread' }, { status: 403 })
  }

  const messages = []
  for (const m of rows) {
    let html: string

    if (m.body_html) {
      // Already stored — re-sanitize defensively on read.
      html = sanitizeEmailHtml(m.body_html)
    } else {
      // Lazy fetch → sanitize → persist. Never 500 the thread on failure.
      try {
        const fetched = await getMessageHtml(m.mailbox as string, m.gmail_message_id)
        const raw = fetched.html ?? fetched.text ?? m.body_text
        html = fetched.html
          ? sanitizeEmailHtml(fetched.html)
          : escapeTextToHtml(fetched.text ?? m.body_text)
        // Persist the sanitized HTML (only when we actually got something).
        if (raw) {
          await admin
            .from('gmail_messages')
            .update({ body_html: html })
            .eq('gmail_message_id', m.gmail_message_id)
        }
      } catch (e) {
        console.error('[inbox/thread] live fetch failed', m.gmail_message_id, e)
        html = escapeTextToHtml(m.body_text)
      }
    }

    messages.push({
      id: m.id,
      gmail_message_id: m.gmail_message_id,
      direction: m.direction,
      from_email: m.from_email,
      to_emails: m.to_emails ?? [],
      subject: m.subject,
      internal_date: m.internal_date,
      body_html: html,
      body_text: m.body_text,
      snippet: m.snippet,
    })
  }

  // Mark the thread read for this caller.
  try {
    await admin.from('inbox_read_state').upsert(
      {
        profile_id: auth.profile.id,
        gmail_thread_id: threadId,
        mailbox: rows[rows.length - 1].mailbox,
        read_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id,gmail_thread_id' },
    )
  } catch (e) {
    console.error('[inbox/thread] read-state upsert failed', e)
  }

  const subject = rows[rows.length - 1].subject ?? rows[0].subject ?? '(no subject)'
  return Response.json({ messages, subject })
}
