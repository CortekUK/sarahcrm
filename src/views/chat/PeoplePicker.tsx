'use client'

// Searchable list of people the viewer may message (GET /people, paged).
// Single-pick for "New message"; multi-select (checkmarks) for the owner's
// group tools.

import { useState } from 'react'
import { Check, Loader2, Search } from 'lucide-react'
import { ChatAvatar } from '@/components/ui/chat'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { usePeople } from '@/lib/chat/hooks'
import type { ChatPerson } from '@/lib/chat/contract'
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue'
import { getApiErrorMessage } from '@/lib/http/chat-client'
import { cn } from '@/lib/utils'

export function PeoplePicker({
  selectedIds,
  excludeIds,
  onPick,
  busyId,
  multi,
  className,
}: {
  selectedIds?: string[]
  excludeIds?: string[]
  onPick: (person: ChatPerson) => void
  busyId?: string | null
  multi?: boolean
  className?: string
}) {
  const [q, setQ] = useState('')
  const debounced = useDebouncedValue(q.trim(), 300)
  const people = usePeople(debounced)
  const list = (people.data?.pages.flatMap((p) => p.people) ?? []).filter(
    (p) => !excludeIds?.includes(p.id),
  )

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or company…"
        suffix={<Search size={14} className="text-text-dim" />}
        autoFocus
      />
      <div className="max-h-[50vh] min-h-[160px] overflow-y-auto rounded-[var(--radius-md)] border border-border">
        {people.isLoading ? (
          <div className="flex items-center justify-center py-10 text-text-dim">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : people.isError ? (
          <p className="px-4 py-8 text-center text-sm text-text-muted">
            {getApiErrorMessage(people.error, 'Couldn’t load people.')}
          </p>
        ) : list.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-text-muted">
            {debounced ? 'Nobody matches that search.' : 'Nobody to message yet — introductions you accept appear here.'}
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {list.map((p) => {
              const selected = selectedIds?.includes(p.id)
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPick(p)}
                    disabled={!!busyId}
                    className={cn(
                      'flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60',
                      selected && 'bg-gold-muted',
                    )}
                  >
                    <ChatAvatar name={p.name} src={p.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-text">{p.name}</span>
                        {p.isAdmin && <Badge variant="upcoming">Team</Badge>}
                      </span>
                      {(p.jobTitle || p.company) && (
                        <span className="block truncate text-xs text-text-dim">
                          {[p.jobTitle, p.company].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    {busyId === p.id ? (
                      <Loader2 size={15} className="animate-spin text-gold" />
                    ) : multi ? (
                      <span
                        className={cn(
                          'flex h-5 w-5 items-center justify-center rounded-full border',
                          selected ? 'border-gold bg-gold text-white' : 'border-border',
                        )}
                      >
                        {selected && <Check size={12} />}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {people.hasNextPage && (
          <div className="flex justify-center border-t border-border/60 py-2">
            <Button variant="ghost" size="sm" loading={people.isFetchingNextPage} onClick={() => people.fetchNextPage()}>
              Load more
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
