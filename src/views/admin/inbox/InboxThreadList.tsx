'use client'

import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { cn } from '@/lib/utils'
import { Inbox, Loader2 } from 'lucide-react'
import { type ThreadRow, type Mailbox, formatRelativeDate, bareAddress } from './shared'

// Left pane: the thread list. Fetching/paging state is owned by InboxPage; this
// component just renders rows, the "Load more" control, and empty/loading UI.
export function InboxThreadList({
  threads,
  selectedId,
  onSelect,
  loading,
  loadingMore,
  hasMore,
  onLoadMore,
  showMailbox,
  mailboxes,
}: {
  threads: ThreadRow[]
  selectedId: string | null
  onSelect: (t: ThreadRow) => void
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
  onLoadMore: () => void
  showMailbox: boolean
  mailboxes: Mailbox[]
}) {
  const labelFor = (email: string) =>
    mailboxes.find((m) => m.email === email)?.label ?? email

  // Label a thread with the person the conversation is with — not the club's
  // own address. The list API returns the LATEST message's sender, which is
  // our own mailbox when the last message was a reply we sent.
  const ownAddresses = new Set(mailboxes.map((m) => m.email.toLowerCase()))
  const partyFor = (t: ThreadRow): { label: string; sentByUs: boolean } => {
    if (t.counterparty_email) return { label: t.counterparty_email, sentByUs: false }
    const from = bareAddress(t.from_email)
    const sentByUs = !!from && (from === t.mailbox.toLowerCase() || ownAddresses.has(from))
    if (sentByUs) return { label: `You (${labelFor(t.mailbox)})`, sentByUs: true }
    return { label: t.from_email || 'Unknown sender', sentByUs: false }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {loading ? (
        <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-text-dim">
          <Loader2 size={14} className="animate-spin" /> Loading conversations…
        </p>
      ) : threads.length === 0 ? (
        <AdminEmptyState
          icon={Inbox}
          title="No messages"
          description="Nothing matches the current inbox and filters."
        />
      ) : (
        <>
          <ul>
            {threads.map((t) => {
              const active = t.gmail_thread_id === selectedId
              const unread = t.unread
              const party = partyFor(t)
              return (
                <li key={`${t.mailbox}:${t.gmail_thread_id}`}>
                  <button
                    onClick={() => onSelect(t)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors border-l-2',
                      active
                        ? 'bg-gold-muted border-gold'
                        : 'border-transparent hover:bg-surface-2',
                    )}
                  >
                    {/* Row 1: sender + date */}
                    <span className="flex items-center gap-2">
                      {unread && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-gold" aria-label="Unread" />
                      )}
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-sm',
                          unread ? 'font-semibold text-text' : 'font-medium text-text',
                        )}
                      >
                        {party.label}
                        {party.sentByUs && (
                          <span className="ml-1.5 text-[11px] font-normal text-text-dim">· last reply sent</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-text-dim">
                        {formatRelativeDate(t.internal_date)}
                      </span>
                    </span>

                    {/* Row 2: subject */}
                    <span
                      className={cn(
                        'truncate text-[13px]',
                        unread ? 'font-semibold text-text' : 'text-text-muted',
                      )}
                    >
                      {t.subject || '(no subject)'}
                      {t.message_count > 1 && (
                        <span className="ml-1.5 text-[11px] font-normal text-text-dim">
                          ({t.message_count})
                        </span>
                      )}
                    </span>

                    {/* Row 3: snippet + mailbox badge */}
                    <span className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate text-xs',
                          unread ? 'text-text-muted' : 'text-text-dim',
                        )}
                      >
                        {t.snippet || '—'}
                      </span>
                      {showMailbox && (
                        <Badge variant="info" className="shrink-0 normal-case tracking-normal">
                          {labelFor(t.mailbox)}
                        </Badge>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          {hasMore && (
            <div className="p-3">
              <Button
                variant="ghost"
                size="sm"
                loading={loadingMore}
                onClick={onLoadMore}
                className="w-full"
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
