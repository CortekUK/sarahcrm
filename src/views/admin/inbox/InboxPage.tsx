'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/hooks/use-toast'
import { Inbox, MailX, Settings2, Search } from 'lucide-react'
import { InboxThreadList } from './InboxThreadList'
import { InboxThreadView } from './InboxThreadView'
import { ManageAccessModal } from './ManageAccessModal'
import { type Mailbox, type ThreadRow, type InboxMessage } from './shared'

const PAGE_SIZE = 30
const ALL = 'all'

// Gmail-style two-pane admin inbox. Left: thread list for the active mailbox
// (or "All"), filtered by search + noise toggle. Right: the selected thread's
// messages, each body rendered in a locked-down sandboxed iframe.
export function InboxPage() {
  // Account/mailbox state.
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [mailboxesLoaded, setMailboxesLoaded] = useState(false)
  const [activeMailbox, setActiveMailbox] = useState<string>(ALL)

  // Filters.
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [includeNoise, setIncludeNoise] = useState(false)

  // Thread list state.
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [nextOffset, setNextOffset] = useState<number | null>(null)

  // Open thread state.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<InboxMessage[]>([])
  const [threadLoading, setThreadLoading] = useState(false)

  const [manageOpen, setManageOpen] = useState(false)

  // ── Load allowed mailboxes once ────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/inbox/mailboxes')
        if (!res.ok) throw new Error(String(res.status))
        const data = await res.json()
        if (cancelled) return
        setMailboxes(data.mailboxes ?? [])
        setIsAdmin(!!data.is_admin)
      } catch {
        if (!cancelled) setMailboxes([])
      } finally {
        if (!cancelled) setMailboxesLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── Debounce the search input (~300ms) ─────────────────────────────
  useEffect(() => {
    const id = setTimeout(() => setDebouncedQ(searchInput.trim()), 300)
    return () => clearTimeout(id)
  }, [searchInput])

  // ── Fetch threads (fresh list on filter change; append on load-more) ─
  const buildUrl = useCallback(
    (offset: number) => {
      const params = new URLSearchParams({
        mailbox: activeMailbox,
        q: debouncedQ,
        includeNoise: includeNoise ? '1' : '0',
        limit: String(PAGE_SIZE),
        offset: String(offset),
      })
      return `/api/admin/inbox/threads?${params.toString()}`
    },
    [activeMailbox, debouncedQ, includeNoise],
  )

  // A token guards against out-of-order responses when filters change fast.
  const reqToken = useRef(0)

  const loadThreads = useCallback(async () => {
    const token = ++reqToken.current
    setListLoading(true)
    try {
      const res = await fetch(buildUrl(0))
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      if (token !== reqToken.current) return
      setThreads(data.threads ?? [])
      setNextOffset(data.nextOffset ?? null)
    } catch {
      if (token === reqToken.current) {
        setThreads([])
        setNextOffset(null)
      }
    } finally {
      if (token === reqToken.current) setListLoading(false)
    }
  }, [buildUrl])

  const loadMore = useCallback(async () => {
    if (nextOffset == null) return
    const token = reqToken.current
    setLoadingMore(true)
    try {
      const res = await fetch(buildUrl(nextOffset))
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      if (token !== reqToken.current) return
      setThreads((prev) => [...prev, ...(data.threads ?? [])])
      setNextOffset(data.nextOffset ?? null)
    } catch {
      toast({ title: 'Could not load more', variant: 'destructive' })
    } finally {
      if (token === reqToken.current) setLoadingMore(false)
    }
  }, [buildUrl, nextOffset])

  // Refetch the list whenever filters change (only after mailboxes resolve).
  useEffect(() => {
    if (!mailboxesLoaded || mailboxes.length === 0) {
      setListLoading(false)
      return
    }
    loadThreads()
  }, [mailboxesLoaded, mailboxes.length, loadThreads])

  // ── Open a thread → fetch messages, optimistically clear unread ────
  const selectThread = useCallback(async (t: ThreadRow) => {
    setSelectedId(t.gmail_thread_id)
    setSelectedSubject(t.subject)
    setThreadLoading(true)
    setThreadMessages([])
    // Opening marks it read server-side; reflect that in the list now.
    setThreads((prev) =>
      prev.map((row) =>
        row.gmail_thread_id === t.gmail_thread_id ? { ...row, unread: false } : row,
      ),
    )
    try {
      const res = await fetch(`/api/admin/inbox/thread/${encodeURIComponent(t.gmail_thread_id)}`)
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json()
      setSelectedSubject(data.subject ?? t.subject)
      setThreadMessages(data.messages ?? [])
    } catch {
      toast({ title: 'Could not open thread', variant: 'destructive' })
      setThreadMessages([])
    } finally {
      setThreadLoading(false)
    }
  }, [])

  // ── Empty state: no mailbox access ─────────────────────────────────
  const noAccess = mailboxesLoaded && mailboxes.length === 0

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left pane */}
      <div className="flex h-full w-[360px] shrink-0 flex-col border-r border-border bg-surface">
        {/* Header + controls */}
        <div className="shrink-0 space-y-3 border-b border-border px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
              Inbox
            </h2>
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Settings2 size={14} />}
                onClick={() => setManageOpen(true)}
              >
                Access
              </Button>
            )}
          </div>

          {/* Account switcher — "All" + one pill per allowed mailbox */}
          {!noAccess && (
            <div className="flex flex-wrap gap-1.5">
              <MailboxPill
                label="All"
                active={activeMailbox === ALL}
                onClick={() => setActiveMailbox(ALL)}
              />
              {mailboxes.map((mb) => (
                <MailboxPill
                  key={mb.email}
                  label={mb.label}
                  active={activeMailbox === mb.email}
                  onClick={() => setActiveMailbox(mb.email)}
                />
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
            />
            <Input
              placeholder="Search mail…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Show noise toggle */}
          <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={includeNoise}
              onChange={(e) => setIncludeNoise(e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--color-gold)]"
            />
            Show noise (newsletters, notifications…)
          </label>
        </div>

        {/* Thread list */}
        {noAccess ? (
          <div className="flex flex-1 items-center justify-center">
            <AdminEmptyState
              icon={MailX}
              title="No inbox access"
              description="You don't have access to any inbox yet. Ask an administrator to grant you access."
            />
          </div>
        ) : (
          <InboxThreadList
            threads={threads}
            selectedId={selectedId}
            onSelect={selectThread}
            loading={listLoading}
            loadingMore={loadingMore}
            hasMore={nextOffset != null}
            onLoadMore={loadMore}
            showMailbox={activeMailbox === ALL}
            mailboxes={mailboxes}
          />
        )}
      </div>

      {/* Right pane — min-h-0 lets the inner reading pane actually scroll */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-2/40">
        {noAccess ? (
          <div className="flex flex-1 items-center justify-center">
            <AdminEmptyState
              icon={MailX}
              title="Nothing to show"
              description="Once you have inbox access, your mail will appear here."
            />
          </div>
        ) : !selectedId ? (
          <div className="flex flex-1 items-center justify-center">
            <AdminEmptyState
              icon={Inbox}
              title="Select a conversation"
              description="Choose a message on the left to read the full thread."
            />
          </div>
        ) : (
          <InboxThreadView
            subject={selectedSubject}
            messages={threadMessages}
            loading={threadLoading}
          />
        )}
      </div>

      {isAdmin && <ManageAccessModal open={manageOpen} onClose={() => setManageOpen(false)} />}
    </div>
  )
}

function MailboxPill({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs transition-colors',
        active
          ? 'border-gold bg-gold-muted font-medium text-gold'
          : 'border-border text-text-muted hover:bg-surface-2 hover:text-text',
      )}
    >
      {label}
    </button>
  )
}
