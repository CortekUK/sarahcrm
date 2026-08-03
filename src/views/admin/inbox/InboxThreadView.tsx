'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { ImageOff, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { sanitizeEmailHtml } from '@/lib/inbox/sanitize-email'
import {
  type InboxMessage,
  formatFullDate,
  formatRecipients,
} from './shared'

// Neutralise remote image sources (tracking pixels) until the user opts in.
// Rewrites http(s)/protocol-relative <img src> to a data- attribute so the
// image doesn't load but layout/toggle is preserved.
function neutralizeRemoteImages(html: string): string {
  return html.replace(
    /(<img\b[^>]*?)\ssrc\s*=\s*(["'])(https?:\/\/|\/\/)[^"']*\2/gi,
    '$1 data-blocked="1"',
  )
}

// Renders one email body.
//
// SECURITY / PRIVACY:
//   - The HTML is sanitised on the SERVER (scripts, event handlers, <style>,
//     <iframe>, forms all stripped) and re-sanitised here on the client for
//     defence in depth, then rendered directly — no iframe. This keeps the
//     reading pane naturally scrollable (an iframe captures the wheel and the
//     pane can't scroll). Rendering sanitised HTML in a div mirrors the app's
//     existing RichText/SOP approach.
//   - Remote images are blocked by default (tracking pixels); "Display images"
//     restores them.
//   - Email HTML assumes a white background, so the body sits on a white card.
function EmailBody({ html }: { html: string }) {
  const [showImages, setShowImages] = useState(false)

  const cleanHtml = useMemo(() => {
    const safe = sanitizeEmailHtml(html)
    return showImages ? safe : neutralizeRemoteImages(safe)
  }, [html, showImages])

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setShowImages((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          <ImageOff size={12} />
          {showImages ? 'Hide remote images' : 'Display images'}
        </button>
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-white p-5">
        <div
          className={cn(
            // Restore readable document typography — the app's global reset
            // strips default margins, which is what makes raw email HTML look
            // cramped. These descendant rules give it proper spacing.
            'text-[13.5px] leading-7 text-[#1f2328] break-words',
            '[&>*+*]:mt-3',
            '[&_p]:my-3',
            '[&_h1]:mb-2 [&_h1]:mt-5 [&_h1]:text-lg [&_h1]:font-semibold',
            '[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-base [&_h2]:font-semibold',
            '[&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-semibold',
            '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1',
            '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-500',
            '[&_hr]:my-5 [&_hr]:border-gray-200',
            '[&_a]:text-blue-700 [&_a]:underline',
            '[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded',
            '[&_table]:max-w-full [&_td]:align-top [&_td]:pr-3',
            '[&_pre]:whitespace-pre-wrap [&_pre]:font-sans',
          )}
          // Sanitised server + client; safe to inject.
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
        />
      </div>
    </div>
  )
}

function MessageCard({ msg }: { msg: InboxMessage }) {
  const inbound = msg.direction === 'inbound'
  const hasHtml = !!(msg.body_html && msg.body_html.trim())

  return (
    <div
      className={cn(
        'rounded-[var(--radius-lg)] border p-4',
        inbound ? 'border-border bg-surface' : 'border-gold/20 bg-gold-muted/40',
      )}
    >
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={inbound ? 'info' : 'upcoming'} className="normal-case tracking-normal">
              {inbound ? (
                <>
                  <ArrowDownLeft size={11} /> Received
                </>
              ) : (
                <>
                  <ArrowUpRight size={11} /> Sent
                </>
              )}
            </Badge>
            <span className="truncate text-sm font-medium text-text">
              {msg.from_email || 'Unknown'}
            </span>
          </div>
          {msg.to_emails && (
            <p className="mt-1 truncate text-xs text-text-dim">
              To: {formatRecipients(msg.to_emails)}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-text-dim">
          {formatFullDate(msg.internal_date)}
        </span>
      </div>

      {/* Body */}
      {hasHtml ? (
        <EmailBody html={msg.body_html as string} />
      ) : msg.body_text ? (
        <pre className="whitespace-pre-wrap break-words font-[family-name:inherit] text-sm text-text">
          {msg.body_text}
        </pre>
      ) : (
        <p className="text-sm text-text-dim">{msg.snippet || '(empty message)'}</p>
      )}
    </div>
  )
}

// Right pane: subject heading + a card per message.
export function InboxThreadView({
  subject,
  messages,
  loading,
}: {
  subject: string | null
  messages: InboxMessage[]
  loading: boolean
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-6 py-3.5">
        <h3 className="truncate font-[family-name:var(--font-heading)] text-base font-semibold text-text">
          {subject || '(no subject)'}
        </h3>
        <p className="text-xs text-text-dim">
          {messages.length} message{messages.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="flex-1 min-h-0 space-y-4 overflow-y-auto bg-surface-2/40 px-6 py-5">
        {loading ? (
          <p className="py-8 text-center text-sm text-text-dim">Loading thread…</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-dim">This thread has no messages.</p>
        ) : (
          messages.map((m) => <MessageCard key={m.id} msg={m} />)
        )}
      </div>
    </div>
  )
}
