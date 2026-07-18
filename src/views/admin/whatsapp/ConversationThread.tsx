'use client'

import Link from 'next/link'
import { MessageScroller, Message, Bubble } from '@/components/ui/chat'
import { Check, CheckCheck, Clock, AlertCircle, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type WaLogRow, type MemberMatch, bubbleTime } from './shared'

// Small delivery-status indicator for OUTBOUND bubbles only.
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'read':
      return <CheckCheck size={13} className="text-gold" aria-label="Read" />
    case 'delivered':
      return <CheckCheck size={13} className="text-bronze" aria-label="Delivered" />
    case 'sent':
      return <Check size={13} className="text-bronze" aria-label="Sent" />
    case 'failed':
      return <AlertCircle size={13} className="text-accent-warm" aria-label="Failed" />
    default:
      return <Clock size={12} className="text-bronze" aria-label={status} />
  }
}

// Right pane thread: contact header + scrolling bubbles (inbound left, outbound
// right), pinned to the latest message.
export function ConversationThread({
  phone,
  label,
  match,
  messages,
}: {
  phone: string
  label: string
  match: MemberMatch | null
  messages: WaLogRow[]
}) {
  return (
    <>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border px-6 py-3.5">
        <div className="min-w-0">
          <h3 className="truncate font-[family-name:var(--font-heading)] text-base font-semibold text-text">
            {label}
          </h3>
          <p className="text-xs tabular-nums text-text-dim">+{phone}</p>
        </div>
        {match && (
          <Link
            href={`/dashboard/members/${match.memberId}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            Member profile
            <ExternalLink size={12} />
          </Link>
        )}
      </div>

      {/* Thread */}
      <MessageScroller pin={messages.length}>
        {messages.map((m) => {
          const side = m.direction === 'inbound' ? 'inbound' : 'outbound'
          const content = m.template_name ? `Template: ${m.template_name}` : m.body || '—'
          return (
            <Message key={m.id} side={side}>
              <Bubble
                side={side}
                footer={
                  <>
                    <span>{bubbleTime(m.created_at)}</span>
                    {side === 'outbound' && <StatusIcon status={m.status} />}
                  </>
                }
              >
                <span className={cn(m.template_name && 'italic text-text-muted')}>{content}</span>
              </Bubble>
            </Message>
          )
        })}
      </MessageScroller>
    </>
  )
}
