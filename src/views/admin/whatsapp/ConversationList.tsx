'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { Plus, MessageCircle } from 'lucide-react'
import { AdminEmptyState } from '@/components/admin/AdminEmptyState'
import { type ContactRow, type MemberMatch, shortTime, initials } from './shared'

// Left pane: search + the conversation list (whatsapp_contacts, newest first).
export function ConversationList({
  contacts,
  selectedPhone,
  onSelect,
  onNew,
  resolveName,
  loading,
}: {
  contacts: ContactRow[]
  selectedPhone: string | null
  onSelect: (phone: string) => void
  onNew: () => void
  resolveName: (c: ContactRow) => { label: string; match: MemberMatch | null }
  loading: boolean
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) => {
      const { label } = resolveName(c)
      return `${label} ${c.phone}`.toLowerCase().includes(q)
    })
  }, [contacts, query, resolveName])

  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col border-r border-border bg-surface">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 pt-4 pb-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-[family-name:var(--font-heading)] text-lg font-semibold text-text">
            WhatsApp
          </h2>
          <Button size="sm" icon={<Plus size={14} />} onClick={onNew}>
            New
          </Button>
        </div>
        <Input
          placeholder="Search name or number…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* List */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-text-dim">Loading…</p>
        ) : filtered.length === 0 ? (
          <AdminEmptyState
            icon={MessageCircle}
            title={query ? 'No matches' : 'No conversations yet'}
            description={
              query
                ? 'No conversations match your search.'
                : 'Start one with the New button, or wait for an inbound reply.'
            }
          />
        ) : (
          <ul>
            {filtered.map((c) => {
              const { label } = resolveName(c)
              const active = c.phone === selectedPhone
              const unread = c.unread_count > 0
              return (
                <li key={c.phone}>
                  <button
                    onClick={() => onSelect(c.phone)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors border-l-2',
                      active
                        ? 'bg-gold-muted border-gold'
                        : 'border-transparent hover:bg-surface-2',
                    )}
                  >
                    {/* Avatar */}
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bronze-muted text-xs font-medium text-bronze ring-1 ring-bronze-line">
                      {initials(label)}
                    </span>
                    {/* Text */}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-sm',
                            unread ? 'font-semibold text-text' : 'font-medium text-text',
                          )}
                        >
                          {label}
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-text-dim">
                          {shortTime(c.last_message_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            'truncate text-xs',
                            unread ? 'text-text-muted' : 'text-text-dim',
                          )}
                        >
                          {c.last_direction === 'outbound' && (
                            <span className="text-text-dim">You: </span>
                          )}
                          {c.last_message_preview || '—'}
                        </span>
                        {unread && (
                          <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-semibold text-white">
                            {c.unread_count}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
