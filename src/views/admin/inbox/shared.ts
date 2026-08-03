// Shared types + helpers for the Gmail-style admin Inbox.
// Data is fetched from /api/admin/inbox/* (built in chunks 1 & 2) — never
// straight from Supabase, since access is gated server-side.

// An inbox the caller is allowed to read (from GET /mailboxes).
export interface Mailbox {
  email: string
  label: string
}

// A thread row in the left list (from GET /threads).
export interface ThreadRow {
  gmail_thread_id: string
  mailbox: string
  subject: string | null
  from_email: string | null
  snippet: string | null
  internal_date: string | number | null
  message_count: number
  unread: boolean
}

// A single message inside an open thread (from GET /thread/<id>).
export interface InboxMessage {
  id: string
  gmail_message_id: string
  direction: string
  from_email: string | null
  to_emails: string | string[] | null
  subject: string | null
  internal_date: string | number | null
  body_html: string | null // already sanitized server-side
  body_text: string | null
  snippet: string | null
}

// Parse Gmail's internal_date, which may arrive as an epoch-ms string/number
// or an ISO timestamp. Returns ms since epoch, or null if unparseable.
function toMillis(raw: string | number | null | undefined): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return raw
  const trimmed = raw.trim()
  if (!trimmed) return null
  // Pure digits → epoch ms (Gmail internalDate).
  if (/^\d+$/.test(trimmed)) return Number(trimmed)
  const t = new Date(trimmed).getTime()
  return Number.isNaN(t) ? null : t
}

// Short relative time for the thread list (e.g. "now", "3m", "2h", "4d",
// then falls back to a "12 Mar" date).
export function formatRelativeDate(raw: string | number | null | undefined): string {
  const then = toMillis(raw)
  if (then == null) return ''
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  return new Date(then).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// Full date-time for a message header (e.g. "12 Mar 2026, 14:32").
export function formatFullDate(raw: string | number | null | undefined): string {
  const then = toMillis(raw)
  if (then == null) return ''
  return new Date(then).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Normalise to_emails (string | string[] | null) into a display string.
export function formatRecipients(to: string | string[] | null): string {
  if (!to) return ''
  return Array.isArray(to) ? to.join(', ') : to
}

// Build a self-contained HTML document for the sandboxed reading iframe.
// A CSP <meta> blocks scripts entirely and, by default, blocks remote images
// (tracking pixels) — only data: URIs load until the user opts in.
export function buildSrcDoc(bodyHtml: string, showImages: boolean): string {
  const imgSrc = showImages ? 'img-src https: http: data:;' : 'img-src data:;'
  const csp = `default-src 'none'; ${imgSrc} style-src 'unsafe-inline'; font-src https: data:; script-src 'none'`
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>
  html,body{margin:0;padding:0;}
  body{
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
    font-size:14px;line-height:1.5;color:#2c2825;padding:4px 2px;
    word-break:break-word;overflow-wrap:anywhere;
  }
  img{max-width:100%;height:auto;}
  a{color:#8a6d3b;}
  table{max-width:100%;}
  blockquote{margin:0 0 0 12px;padding-left:12px;border-left:3px solid #e5e0d8;color:#6b6560;}
</style>
</head>
<body>${bodyHtml}</body>
</html>`
}
